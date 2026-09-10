/**
 * Monthly recurring revenue, normalized — the one place a Stripe recurring
 * price becomes "cents per month".
 *
 * Client-safe and pure on purpose: every MRR surface (the platform Overview,
 * the Revenue page, Analytics, the Clinics list, the Subscriptions table) has
 * to agree, and the way they stopped agreeing was three copies of a
 * hardcoded tier→price map that drifted apart. There is no price table here
 * at all — the amount comes from Stripe, which is the only thing that knows
 * what a clinic actually pays.
 */

export interface RecurringPrice {
  /** `price.unit_amount` — the per-seat amount, per BILLING PERIOD. */
  unitAmountCents: number | null
  /** `price.recurring.interval` — 'day' | 'week' | 'month' | 'year'. */
  interval: string | null
  /**
   * `price.recurring.interval_count`. A price with interval 'month' and
   * interval_count 3 bills QUARTERLY — counting it as monthly overstates that
   * subscription's MRR threefold.
   */
  intervalCount?: number | null
  /**
   * `subscription_item.quantity` — seats. A 3-seat subscription bills three
   * times the unit amount, and dropping it undercounts by the same factor.
   */
  quantity?: number | null
}

/** How many months one billing period covers. */
const MONTHS_PER_INTERVAL: Record<string, number> = {
  day: 1 / 30,
  week: 1 / 4,
  month: 1,
  year: 12,
}

/**
 * Cents per month for one recurring line, whatever cadence it bills on.
 *
 * An unrecognised interval is treated as monthly — the same fallback this
 * replaced. Erring toward the shortest common period keeps an unknown
 * cadence from silently disappearing from the total.
 */
export function normalizedMonthlyCents(price: RecurringPrice): number {
  if (price.unitAmountCents == null) return 0
  // A missing/zero/negative quantity or interval_count is Stripe telling us
  // nothing useful, not "zero seats" or "a period of no length".
  const seats = price.quantity != null && price.quantity > 0 ? price.quantity : 1
  const periods =
    price.intervalCount != null && price.intervalCount > 0 ? price.intervalCount : 1
  const monthsPerPeriod = (MONTHS_PER_INTERVAL[price.interval ?? 'month'] ?? 1) * periods
  return Math.round((price.unitAmountCents * seats) / monthsPerPeriod)
}
