import 'server-only'
import { and, eq, lte } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/**
 * Stripe-side refunds, brought back into our own money records.
 *
 * Every Connect money path (shop orders, portal balance payments, booking
 * deposits) recorded a charge, but nothing ever recorded the charge coming
 * BACK. A clinic that refunded an order in the Stripe dashboard kept reading
 * "Paid" on its own board — the record and the money disagreed, and the
 * record is what the front desk reconciles the PMS ledger from.
 *
 * The lookup key is `stripe_payment_intent_id`: all three finalizers stamp it
 * when the payment lands, and both `charge.refunded` and `refund.created`
 * carry it. A checkout session id appears on neither refund event.
 *
 * ── Why only shop orders change `status` ──────────────────────────────────
 *
 * `shop_order.status` has 'refunded' in its documented vocabulary, its board
 * already filters and labels it, and every aggregate over it
 * (`status = 'paid'` sales totals, top products, patient spend) SHOULD stop
 * counting a refunded order. Flipping it is the fix.
 *
 * `patient_balance_payment.status` and `booking_deposit.status` are
 * 'pending' | 'paid' | 'failed' — nothing more. Eight readers key off
 * `status = 'paid'` (the reconciliation list and its CSV, the collections
 * board, loyalty accrual, the patient timeline, thread activity, the deposit
 * pill). Introducing a fourth value would silently drop a refunded payment
 * out of the very list the front desk needs it in — the front desk has
 * already posted that money to the PMS and now needs to reverse it. So those
 * two carry the refund in `refundedAmountCents` / `refundedAt` and their
 * surfaces read it; `status` keeps meaning "did the charge succeed".
 *
 * Two rules make this safe to call with any event, in any order, any number
 * of times:
 *
 *  1. `refundedAmountCents` only ever goes UP. Stripe's `amount_refunded` is
 *     CUMULATIVE per charge and webhook delivery is not ordered, so two
 *     partial refunds can arrive back-to-front. Taking the larger value (and
 *     guarding the UPDATE on it) means a late, smaller event cannot walk the
 *     total backwards.
 *  2. A shop order is marked 'refunded' only on a FULL refund, and only from
 *     'paid'. A partial refund claiming the whole order came back would be a
 *     new lie in place of the old one; 'pending' and 'cancelled' are states
 *     another money path or a human owns — we record the money that moved, we
 *     do not overwrite their decision.
 */

/** What Stripe told us came back, for one charge on a connected account. */
export interface ConnectRefundEvent {
  organizationId: string
  /** The PaymentIntent the refunded charge belongs to — our lookup key. */
  paymentIntentId: string
  /** Cumulative cents refunded on the charge so far. */
  amountRefundedCents: number
  /** The charge's own total, so a full refund is distinguishable from a partial one. */
  chargeAmountCents: number
}

export type RefundedRecordKind = 'shop_order' | 'balance_payment' | 'booking_deposit'

/** The row as it stands before the event is applied. */
interface RefundableRow {
  refundedAmountCents: number
  status: string
}

/** What the event changes. `null` = already recorded; write nothing. */
interface RefundWrite {
  refundedAmountCents: number
  /** Shop orders only — see the file header. */
  markRefunded: boolean
}

/**
 * The whole decision, as a pure function — the part that can be wrong, kept
 * out of the query so it can be tested on its own.
 *
 * `canMarkRefunded` is false for the two tables whose `status` column has no
 * 'refunded' value.
 */
export function planRefundWrite(
  row: RefundableRow,
  event: Pick<ConnectRefundEvent, 'amountRefundedCents' | 'chargeAmountCents'>,
  canMarkRefunded: boolean,
): RefundWrite | null {
  const already = row.refundedAmountCents ?? 0
  const next = Math.max(already, Math.max(0, event.amountRefundedCents))
  // A charge amount of 0 (or a nonsense one) must never read as "fully
  // refunded" — that would flip a paid order on an event carrying no money.
  const fullyRefunded =
    event.chargeAmountCents > 0 && event.amountRefundedCents >= event.chargeAmountCents
  const markRefunded = canMarkRefunded && fullyRefunded && row.status === 'paid'
  if (next === already && !markRefunded) return null
  return { refundedAmountCents: next, markRefunded }
}

/**
 * Record a Connect refund against whichever of our money records owns the
 * charge. Returns the kinds actually updated (empty = none of ours, or an
 * event we had already recorded).
 *
 * A PaymentIntent belongs to exactly one of the three, but all three are
 * checked rather than trusting event metadata to say which — a refund issued
 * from the Stripe dashboard carries none.
 */
export async function recordConnectRefund(event: ConnectRefundEvent): Promise<RefundedRecordKind[]> {
  const updated: RefundedRecordKind[] = []
  if (!event.organizationId || !event.paymentIntentId) return updated

  const now = new Date()

  // ── shop orders ──────────────────────────────────────────────────────────
  {
    const [row] = await db
      .select({
        id: schema.shopOrder.id,
        status: schema.shopOrder.status,
        refundedAmountCents: schema.shopOrder.refundedAmountCents,
        refundedAt: schema.shopOrder.refundedAt,
      })
      .from(schema.shopOrder)
      .where(
        and(
          eq(schema.shopOrder.organizationId, event.organizationId),
          eq(schema.shopOrder.stripePaymentIntentId, event.paymentIntentId),
        ),
      )
      .limit(1)
    const plan = row ? planRefundWrite(row, event, true) : null
    if (row && plan) {
      const done = await db
        .update(schema.shopOrder)
        .set({
          refundedAmountCents: plan.refundedAmountCents,
          refundedAt: row.refundedAt ?? now,
          ...(plan.markRefunded ? { status: 'refunded' } : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.shopOrder.organizationId, event.organizationId),
            eq(schema.shopOrder.id, row.id),
            // Monotonic: a racing writer that already recorded MORE wins.
            lte(schema.shopOrder.refundedAmountCents, plan.refundedAmountCents),
          ),
        )
        .returning({ id: schema.shopOrder.id })
      if (done.length > 0) updated.push('shop_order')
    }
  }

  // ── portal balance payments (status untouched — see the file header) ─────
  {
    const [row] = await db
      .select({
        id: schema.patientBalancePayment.id,
        status: schema.patientBalancePayment.status,
        refundedAmountCents: schema.patientBalancePayment.refundedAmountCents,
        refundedAt: schema.patientBalancePayment.refundedAt,
      })
      .from(schema.patientBalancePayment)
      .where(
        and(
          eq(schema.patientBalancePayment.organizationId, event.organizationId),
          eq(schema.patientBalancePayment.stripePaymentIntentId, event.paymentIntentId),
        ),
      )
      .limit(1)
    const plan = row ? planRefundWrite(row, event, false) : null
    if (row && plan) {
      const done = await db
        .update(schema.patientBalancePayment)
        .set({
          refundedAmountCents: plan.refundedAmountCents,
          refundedAt: row.refundedAt ?? now,
        })
        .where(
          and(
            eq(schema.patientBalancePayment.organizationId, event.organizationId),
            eq(schema.patientBalancePayment.id, row.id),
            lte(schema.patientBalancePayment.refundedAmountCents, plan.refundedAmountCents),
          ),
        )
        .returning({ id: schema.patientBalancePayment.id })
      if (done.length > 0) updated.push('balance_payment')
    }
  }

  // ── booking deposits (status untouched — see the file header) ────────────
  {
    const [row] = await db
      .select({
        id: schema.bookingDeposit.id,
        status: schema.bookingDeposit.status,
        refundedAmountCents: schema.bookingDeposit.refundedAmountCents,
        refundedAt: schema.bookingDeposit.refundedAt,
      })
      .from(schema.bookingDeposit)
      .where(
        and(
          eq(schema.bookingDeposit.organizationId, event.organizationId),
          eq(schema.bookingDeposit.stripePaymentIntentId, event.paymentIntentId),
        ),
      )
      .limit(1)
    const plan = row ? planRefundWrite(row, event, false) : null
    if (row && plan) {
      const done = await db
        .update(schema.bookingDeposit)
        .set({
          refundedAmountCents: plan.refundedAmountCents,
          refundedAt: row.refundedAt ?? now,
        })
        .where(
          and(
            eq(schema.bookingDeposit.organizationId, event.organizationId),
            eq(schema.bookingDeposit.id, row.id),
            lte(schema.bookingDeposit.refundedAmountCents, plan.refundedAmountCents),
          ),
        )
        .returning({ id: schema.bookingDeposit.id })
      if (done.length > 0) updated.push('booking_deposit')
    }
  }

  return updated
}
