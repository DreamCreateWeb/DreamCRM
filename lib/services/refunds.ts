import 'server-only'
import { and, desc, eq, lte, sql } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import { reverseLoyaltyForRefundedPayment } from './loyalty'

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
 * A fully refunded balance payment also takes its loyalty points back — see
 * that block. The return value keeps meaning "which MONEY records moved", so
 * a points reversal on an already-recorded refund does not resurrect it.
 *
 * A PaymentIntent belongs to exactly one of the three, but all three are
 * checked rather than trusting event metadata to say which — a refund issued
 * from the Stripe dashboard carries none.
 *
 * Either way a `connect_refund` receipt is written (`recordRefundReceipt`), so
 * a refund that matched nothing — a membership charge, most often — reaches a
 * record the clinic can read instead of a log line.
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
        amountCents: schema.patientBalancePayment.amountCents,
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
    // Loyalty follows the money. A payment that has been sent back in FULL
    // must not leave the patient holding the points it earned, and the
    // ledger is one of our money records too.
    //
    // This runs off the ROW, not off `plan`, and on every delivery: a
    // redelivered event whose amount we had already recorded still finds a
    // reversal that a crash between the two writes would otherwise have
    // lost. The reversal is idempotent by unique index, so calling it again
    // costs nothing. Best-effort — the refund record is the thing that must
    // land, and a loyalty write that fails must never cost us that.
    if (row) {
      const refundedTotal = Math.max(row.refundedAmountCents ?? 0, event.amountRefundedCents)
      try {
        await reverseLoyaltyForRefundedPayment(event.organizationId, row.id, {
          amountCents: row.amountCents,
          refundedAmountCents: refundedTotal,
        })
      } catch (err) {
        console.warn('[refunds] could not reverse loyalty points', { paymentId: row.id }, err)
      }
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

  await recordRefundReceipt(event, updated, now)

  return updated
}

/**
 * The receipt: one row per refunded charge, whether or not it matched a
 * payment of ours.
 *
 * A MEMBERSHIP subscription charge rides the same connected account and has a
 * row in none of the three tables above — the `membership` row tracks the
 * SUBSCRIPTION, not its individual charges — so a refunded membership payment
 * used to reach a `console.warn` and nothing else. The practice's bank balance
 * moved and their software said nothing. (Payment-plan installments DO match
 * already: `chargePlanInstallment` records each one as a
 * `patient_balance_payment` with the PaymentIntent stamped, so a refund on one
 * lands on that row. The gap was membership alone.)
 *
 * `attachedTo` is the whole point of the row. 'none' is the readable version
 * of that log line — money left this clinic's Stripe account and we have no
 * payment record for it, which is exactly what the front desk needs to see
 * before they reconcile.
 *
 * Monotonic, like everything else on this path: the upsert only raises
 * `refunded_amount_cents`, so an out-of-order delivery cannot walk a receipt
 * backwards, and a redelivered event updates its own row rather than minting a
 * second one (the unique (org, payment intent) index is the claim key).
 * `refunded_at` keeps the FIRST sighting.
 *
 * Best-effort by construction: the money records above are the thing that must
 * land, and a failed receipt must never cost us one of those or make Stripe
 * retry a refund we already recorded.
 */
async function recordRefundReceipt(
  event: ConnectRefundEvent,
  updated: RefundedRecordKind[],
  now: Date,
): Promise<void> {
  const attachedTo = updated[0] ?? 'none'
  try {
    await db
      .insert(schema.connectRefund)
      .values({
        id: `cr_${randomBytes(10).toString('hex')}`,
        organizationId: event.organizationId,
        stripePaymentIntentId: event.paymentIntentId,
        refundedAmountCents: Math.max(0, event.amountRefundedCents),
        chargeAmountCents: Math.max(0, event.chargeAmountCents),
        attachedTo,
        refundedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.connectRefund.organizationId, schema.connectRefund.stripePaymentIntentId],
        set: {
          refundedAmountCents: sql`greatest(${schema.connectRefund.refundedAmountCents}, excluded.refunded_amount_cents)`,
          chargeAmountCents: sql`greatest(${schema.connectRefund.chargeAmountCents}, excluded.charge_amount_cents)`,
          // A later delivery that DID attach upgrades the receipt; one that
          // did not must never downgrade an attachment we already made (the
          // finalizer may have stamped the PaymentIntent in between).
          attachedTo: sql`case when excluded.attached_to = 'none' then ${schema.connectRefund.attachedTo} else excluded.attached_to end`,
          updatedAt: now,
        },
      })
  } catch (err) {
    console.warn('[refunds] could not record the refund receipt', {
      organizationId: event.organizationId,
      paymentIntentId: event.paymentIntentId,
    }, err)
  }
}

/** A refunded charge on the clinic's connected account that matched no payment
 *  record of ours — money out of their Stripe with nothing here to reconcile
 *  it against. */
export interface UnmatchedRefundRow {
  id: string
  refundedAmountCents: number
  chargeAmountCents: number
  refundedAt: Date
}

/**
 * The unattached refunds for a clinic's reconciliation page, newest first.
 *
 * Deliberately ONLY `attached_to = 'none'`: a refund we could attach already
 * shows on the row it belongs to (the order, the payment, the deposit), and
 * listing it twice would make a clinic count the same reversal twice.
 */
export async function listUnmatchedRefunds(
  organizationId: string,
  limit = 20,
): Promise<UnmatchedRefundRow[]> {
  const rows = await db
    .select({
      id: schema.connectRefund.id,
      refundedAmountCents: schema.connectRefund.refundedAmountCents,
      chargeAmountCents: schema.connectRefund.chargeAmountCents,
      refundedAt: schema.connectRefund.refundedAt,
    })
    .from(schema.connectRefund)
    .where(
      and(
        eq(schema.connectRefund.organizationId, organizationId),
        eq(schema.connectRefund.attachedTo, 'none'),
      ),
    )
    .orderBy(desc(schema.connectRefund.refundedAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    refundedAmountCents: r.refundedAmountCents ?? 0,
    chargeAmountCents: r.chargeAmountCents ?? 0,
    refundedAt: r.refundedAt,
  }))
}
