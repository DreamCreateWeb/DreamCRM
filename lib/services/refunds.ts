import 'server-only'
import { and, desc, eq, isNull, lt, lte, or, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import { syncLoyaltyForRefundedPayment } from './loyalty'

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
 *  1. THE ORDERING RULE. `amount_refunded` is a cumulative SNAPSHOT of the
 *     charge and webhook delivery is not ordered, so two partial refunds can
 *     arrive back-to-front. The original rule was "the total only ever goes
 *     UP", which is the only safe rule available when you cannot tell which
 *     snapshot is newer — and it is why a refund that later FAILED could never
 *     be taken back: Stripe decrements `amount_refunded` and fires
 *     `charge.refund.updated`, and a monotonic record kept showing money
 *     returned that never left.
 *
 *     So we now record WHEN the snapshot we applied was taken, in
 *     `refund_synced_at`, and order by that instead. A strictly NEWER snapshot
 *     wins outright — down as well as up. Anything not strictly newer falls
 *     back to the old monotonic rule, unchanged.
 *
 *     The ordering key is Stripe's own `event.created`, so there is exactly
 *     ONE clock and it is not ours. A snapshot we FETCHED (the refund-object
 *     events re-read the charge) is at least as fresh as the event that
 *     triggered the fetch, so stamping it with that event's time only ever
 *     UNDER-claims its freshness — and the cost of under-claiming is the
 *     monotonic branch, which is where we were before. There is no direction
 *     in which this rule is worse than the rule it replaces. Two events in the
 *     same second are unorderable and tie to monotonic, deliberately; a
 *     failure arrives minutes to days after the refund, never in the same
 *     second. No `event.created` at all (nothing Stripe sends) means no
 *     ordering key, which is monotonic too.
 *
 *     The CAS on each UPDATE carries whichever rule applied, so two webhook
 *     deliveries racing each other resolve the same way the pure function
 *     does.
 *  2. A shop order is marked 'refunded' only on a FULL refund, and only from
 *     'paid'. A partial refund claiming the whole order came back would be a
 *     new lie in place of the old one; 'pending' and 'cancelled' are states
 *     another money path or a human owns — we record the money that moved, we
 *     do not overwrite their decision.
 *
 *     Its mirror, which arrived with rule 1: a shop order goes BACK to 'paid'
 *     only from 'refunded', only on a strictly newer snapshot, and only when
 *     that snapshot says the charge is no longer fully refunded. This path is
 *     the only writer of 'refunded' on `shop_order`, so un-setting it takes
 *     back our own claim rather than overruling somebody else's.
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
  /**
   * WHEN this snapshot of the charge was taken — Stripe's `event.created`.
   * The ordering key for rule 1 in the file header. Absent (or null) means we
   * cannot order this observation at all, and the monotonic rule applies.
   */
  observedAt?: Date | null
}

export type RefundedRecordKind = 'shop_order' | 'balance_payment' | 'booking_deposit'

/** The row as it stands before the event is applied. */
interface RefundableRow {
  refundedAmountCents: number
  status: string
  /** When the snapshot this row records was taken. Null = never ordered. */
  refundSyncedAt?: Date | null
}

/** What the event changes. `null` = already recorded; write nothing. */
interface RefundWrite {
  refundedAmountCents: number
  /** Shop orders only — see the file header. */
  markRefunded: boolean
  /** Shop orders only: a failed refund takes 'refunded' back to 'paid'. */
  unmarkRefunded: boolean
  /** Nothing came back after all, so "when money came back" is no longer true. */
  clearRefundedAt: boolean
  /**
   * The watermark to stamp, or null to leave it alone. Non-null exactly when
   * this observation SUPERSEDES the row's — which is also what tells
   * `recordConnectRefund` which compare-and-swap to guard the UPDATE with.
   */
  syncedAt: Date | null
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
  event: Pick<ConnectRefundEvent, 'amountRefundedCents' | 'chargeAmountCents' | 'observedAt'>,
  canMarkRefunded: boolean,
): RefundWrite | null {
  const already = row.refundedAmountCents ?? 0
  const reported = Math.max(0, event.amountRefundedCents)

  // Rule 1 (file header): a STRICTLY newer snapshot is believed outright, in
  // either direction. `>` and not `>=` on purpose — a redelivered event
  // carries the same `created`, and an equal timestamp is not evidence of
  // newness, so a replay must not be allowed to re-decide anything.
  const observedAt = event.observedAt ?? null
  const supersedes =
    observedAt != null &&
    (row.refundSyncedAt == null || observedAt.getTime() > row.refundSyncedAt.getTime())
  const next = supersedes ? reported : Math.max(already, reported)

  // A charge amount of 0 (or a nonsense one) must never read as "fully
  // refunded" — that would flip a paid order on an event carrying no money.
  // Graded on `next` rather than on the raw event, because `next` is what we
  // are about to believe about this charge.
  const fullyRefunded = event.chargeAmountCents > 0 && next >= event.chargeAmountCents
  const markRefunded = canMarkRefunded && fullyRefunded && row.status === 'paid'
  const unmarkRefunded = canMarkRefunded && supersedes && !fullyRefunded && row.status === 'refunded'

  // A superseding observation always writes, even when the amount is
  // unchanged: the watermark it carries is what lets the NEXT observation be
  // ordered against it, and leaving it behind would make a later, staler
  // snapshot look new.
  if (!supersedes && next === already && !markRefunded) return null

  return {
    refundedAmountCents: next,
    markRefunded,
    unmarkRefunded,
    clearRefundedAt: next === 0,
    syncedAt: supersedes ? observedAt : null,
  }
}

/**
 * The columns every refundable table shares, given a plan.
 *
 * `refundedAt` means "when money first came back". A plan that takes the total
 * to zero says none ever did, so it clears rather than leaving a date beside a
 * zero — the smaller version of the same lie this whole change exists to stop.
 */
function refundColumns(plan: RefundWrite, rowRefundedAt: Date | null, now: Date) {
  return {
    refundedAmountCents: plan.refundedAmountCents,
    refundedAt: plan.clearRefundedAt ? null : rowRefundedAt ?? now,
    ...(plan.syncedAt ? { refundSyncedAt: plan.syncedAt } : {}),
  }
}

/**
 * The compare-and-swap, carrying whichever ordering rule the plan used.
 *
 * Superseding write: only if the row's watermark is still older than ours, so
 * a racing writer holding an even NEWER snapshot wins. Monotonic write: the
 * original guard, so a racing writer that already recorded MORE wins. Either
 * way the concurrent outcome matches what `planRefundWrite` decided.
 */
function refundGuard(amountCol: AnyPgColumn, syncedCol: AnyPgColumn, plan: RefundWrite) {
  return plan.syncedAt
    ? or(isNull(syncedCol), lt(syncedCol, plan.syncedAt))
    : lte(amountCol, plan.refundedAmountCents)
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
        refundSyncedAt: schema.shopOrder.refundSyncedAt,
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
          ...refundColumns(plan, row.refundedAt, now),
          // The only writer of 'refunded' here is this path, so un-setting it
          // takes back our own claim — see rule 2 in the file header.
          ...(plan.markRefunded ? { status: 'refunded' } : {}),
          ...(plan.unmarkRefunded ? { status: 'paid' } : {}),
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.shopOrder.organizationId, event.organizationId),
            eq(schema.shopOrder.id, row.id),
            refundGuard(schema.shopOrder.refundedAmountCents, schema.shopOrder.refundSyncedAt, plan),
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
        refundSyncedAt: schema.patientBalancePayment.refundSyncedAt,
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
        .set(refundColumns(plan, row.refundedAt, now))
        .where(
          and(
            eq(schema.patientBalancePayment.organizationId, event.organizationId),
            eq(schema.patientBalancePayment.id, row.id),
            refundGuard(
              schema.patientBalancePayment.refundedAmountCents,
              schema.patientBalancePayment.refundSyncedAt,
              plan,
            ),
          ),
        )
        .returning({ id: schema.patientBalancePayment.id })
      if (done.length > 0) updated.push('balance_payment')
    }
    // Loyalty follows the money. A payment that has been sent back in FULL
    // must not leave the patient holding the points it earned, and the
    // ledger is one of our money records too.
    //
    // This runs on every delivery, plan or no plan: a redelivered event whose
    // amount we had already recorded still finds a reversal that a crash
    // between the two writes would otherwise have lost. Both directions are
    // idempotent, so calling again costs nothing. Best-effort — the refund
    // record is the thing that must land, and a loyalty write that fails must
    // never cost us that.
    //
    // The total it reasons from is the PLAN's, not a fresh `Math.max` — that
    // max was a second copy of the monotonic rule, and it would have kept
    // reversing points for a refund the ordering rule had just un-recorded.
    // One decision, one place (see the file header).
    if (row) {
      const refundedTotal = plan?.refundedAmountCents ?? row.refundedAmountCents ?? 0
      try {
        await syncLoyaltyForRefundedPayment(event.organizationId, row.id, {
          amountCents: row.amountCents,
          refundedAmountCents: refundedTotal,
        })
      } catch (err) {
        console.warn('[refunds] could not settle loyalty points', { paymentId: row.id }, err)
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
        refundSyncedAt: schema.bookingDeposit.refundSyncedAt,
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
        .set(refundColumns(plan, row.refundedAt, now))
        .where(
          and(
            eq(schema.bookingDeposit.organizationId, event.organizationId),
            eq(schema.bookingDeposit.id, row.id),
            refundGuard(
              schema.bookingDeposit.refundedAmountCents,
              schema.bookingDeposit.refundSyncedAt,
              plan,
            ),
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
 * Ordered exactly like the three money rows, and for the same reason: a
 * strictly newer snapshot (`refund_synced_at`) is believed outright, and
 * anything else falls back to `greatest()`. Without this half the receipt
 * would be the last place still claiming a failed refund came back — and for a
 * MEMBERSHIP charge, which matches none of the three tables, the receipt is
 * the ONLY place the clinic reads it. A redelivered event updates its own row
 * rather than minting a second one (the unique (org, payment intent) index is
 * the claim key). `refunded_at` keeps the FIRST sighting.
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
        refundSyncedAt: event.observedAt ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.connectRefund.organizationId, schema.connectRefund.stripePaymentIntentId],
        set: {
          // The ordering rule, in SQL. `excluded.refund_synced_at` is this
          // event's `created`; a NULL on either side means the pair cannot be
          // ordered, and an unorderable pair falls back to `greatest()` —
          // which is the behaviour this row has always had.
          refundedAmountCents: sql`case when excluded.refund_synced_at is not null and (${schema.connectRefund.refundSyncedAt} is null or excluded.refund_synced_at > ${schema.connectRefund.refundSyncedAt}) then excluded.refunded_amount_cents else greatest(${schema.connectRefund.refundedAmountCents}, excluded.refunded_amount_cents) end`,
          // The charge's own total never legitimately shrinks, so this half
          // stays plainly monotonic.
          chargeAmountCents: sql`greatest(${schema.connectRefund.chargeAmountCents}, excluded.charge_amount_cents)`,
          refundSyncedAt: sql`greatest(${schema.connectRefund.refundSyncedAt}, excluded.refund_synced_at)`,
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
