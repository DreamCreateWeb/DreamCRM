/**
 * THE NETTING RULE: what the clinic actually KEPT on a charge.
 *
 * `DREAMCRM-23` put refund truth in the database — `refunded_amount_cents` on
 * `shop_order`, `patient_balance_payment` and `booking_deposit`, written by the
 * Connect refund webhook (`lib/services/refunds.ts`). Nothing clinic-facing
 * read it, so every "collected" figure still added the face value of money
 * that had gone back to the patient, and a clinic reconciling its month was
 * told it took in more than it did.
 *
 * The rule, decided once here so the surfaces cannot disagree:
 *
 *   A charge that SUCCEEDED counts at `amount_cents − refunded_amount_cents`.
 *   A charge that never succeeded ('pending', 'failed', 'cancelled') does not
 *   count at all.
 *
 * Two consequences worth stating, because they are what makes it one rule
 * rather than three:
 *
 *  - The status filter does not change. Balance payments and deposits keep
 *    `status = 'paid'` after a refund on purpose (the front desk has already
 *    posted that money to the PMS and needs the row to stay in the
 *    reconciliation list — see the header of `lib/services/refunds.ts`), so
 *    netting is the ONLY thing that makes their totals honest. A shop order
 *    flips to 'refunded' on a FULL refund and leaves the 'paid' set, and its
 *    net would be zero anyway; the partial case is what netting adds there.
 *  - The net is clamped at zero. `refunded_amount_cents` is monotonic by
 *    construction and Stripe cannot send back more than it took, but a total
 *    that can go negative is a total one bad row can drive a whole clinic's
 *    month below zero, and there is no reading of "refunded more than paid"
 *    that means the clinic kept a negative amount.
 *
 * Pure and client-safe, like `lib/mrr.ts`: the SQL builders below only
 * assemble a fragment, and the arithmetic helper is the same rule for rows
 * already in hand. `tests/guards/net-refunds.test.ts` fails if a clinic-side
 * money total is summed without going through here.
 */
import { sql, type SQL, type AnyColumn } from 'drizzle-orm'

/**
 * Cents the clinic kept on one charge, for rows already loaded.
 *
 * Nulls are treated as "nothing came back" / "no money" rather than NaN — a
 * total is the last place a missing column should produce one.
 */
export function netCollectedCents(
  amountCents: number | null | undefined,
  refundedAmountCents: number | null | undefined,
): number {
  const amount = amountCents ?? 0
  const refunded = Math.max(0, refundedAmountCents ?? 0)
  return Math.max(0, amount - refunded)
}

/**
 * Does this row's `status` mean the money actually LANDED?
 *
 * One predicate covers all three tables because their vocabularies overlap
 * exactly where it matters: 'paid' means the charge succeeded everywhere, and
 * 'refunded' exists only in `shop_order`'s vocabulary (balance payments and
 * deposits deliberately never leave 'paid' — the file header explains why).
 * Everything else — 'pending', 'failed', 'cancelled' — is money that never
 * arrived, and nets to nothing rather than to its face value.
 */
export function isCollectedStatus(status: string | null | undefined): boolean {
  return status === 'paid' || status === 'refunded'
}

/**
 * The whole rule in one call, for a row whose status is in hand: cents the
 * clinic kept, or 0 if the charge never landed.
 *
 * The SQL aggregates below express the same rule the other way round — the
 * status filter lives in the WHERE clause and the netting in the SUM.
 */
export function collectedCents(
  status: string | null | undefined,
  amountCents: number | null | undefined,
  refundedAmountCents: number | null | undefined,
): number {
  return isCollectedStatus(status) ? netCollectedCents(amountCents, refundedAmountCents) : 0
}

/**
 * How a per-EVENT surface says money came back — `null` when none did.
 *
 * The netting rule is for TOTALS. A timeline entry, a thread marker and a
 * receipt are records of what happened on the day it happened, so their face
 * value is correct and must not be netted away: the patient really did pay
 * $400 on the 3rd. What they owe the reader is the rest of the story, and the
 * batch sweep found three of them telling the clinic "$400 paid" while the
 * patient's own portal already said "Refunded to you" — one event, two
 * stories, and a front desk on the phone between them.
 *
 * Single-homed here for the same reason the arithmetic is: the wording is the
 * thing that has to agree across surfaces. The caller passes its own money
 * formatter, because these surfaces disagree about `$50` vs `$50.00` and that
 * is a house-style question, not a money one.
 */
export function refundNote(
  amountCents: number | null | undefined,
  refundedAmountCents: number | null | undefined,
  formatCents: (cents: number) => string,
): string | null {
  const refunded = Math.max(0, refundedAmountCents ?? 0)
  if (refunded <= 0) return null
  const amount = amountCents ?? 0
  return refunded >= amount && amount > 0
    ? 'Refunded'
    : `${formatCents(refunded)} refunded`
}

/** `amount − refunded`, clamped at 0, for ONE row. */
export function netCollectedSql(amount: AnyColumn, refunded: AnyColumn): SQL<number> {
  return sql<number>`greatest(${amount} - coalesce(${refunded}, 0), 0)`
}

/**
 * `sum(amount − refunded)` over the selected rows, as a whole-cents total.
 *
 * `::bigint` rather than `::int`: `sum()` over an int4 column already returns
 * one, and the `::int` this replaced would have ERRORED (not wrapped) above
 * ~$21M — the same trap the collections header hit in DREAMCRM-23.
 */
export function sumNetCollectedSql(amount: AnyColumn, refunded: AnyColumn): SQL<number> {
  return sql<number>`coalesce(sum(${netCollectedSql(amount, refunded)}), 0)::bigint`
}

/**
 * The share of a charge that was NOT sent back, in [0, 1].
 *
 * For line-level revenue under an ORDER-level refund. Stripe refunds a
 * charge, not a line: nothing in the data says which item came back, so a
 * refunded order reduces every line it contains in proportion — the standard
 * accounting allocation, and the only one that keeps the lines summing to the
 * order's net.
 *
 * A zero (or null) charge amount yields 1: Postgres `least`/`greatest` ignore
 * null arguments, so `nullif` divides by nothing and the row is read as "no
 * money came back", which is the honest answer for a charge that took none.
 */
export function keptFractionSql(amount: AnyColumn, refunded: AnyColumn): SQL<number> {
  return sql<number>`greatest(0, least(1, 1 - coalesce(${refunded}, 0)::numeric / nullif(${amount}, 0)))`
}
