/**
 * THE METRIC REGISTRY (ML-38) — client-safe and pure: what is measured, how
 * often, for whom. The readers that compute each number from the live tables
 * are server-only and live in `lib/services/metric-readers.ts`, keyed by this
 * file's `MetricKey` (a missing reader is a type error and a failing test).
 *
 * BUCKETS. An org's 'day' bucket is a CLINIC-LOCAL `YYYY-MM-DD` (timezone
 * rule 2). Platform rows have no clinic, so their buckets are UTC days
 * (`YYYY-MM-DD`) and UTC hours (`YYYY-MM-DDTHH`) — and the tiles that read
 * them say so (`PLATFORM_BUCKET_NOTE`).
 *
 * KIND. A 'flow' is what happened inside the bucket's day (sends, bookings);
 * a 'stock' is the standing number when the day closed (the outstanding
 * balance, patients due). Stocks are read on the first tick after the day
 * closes, so they are the close-of-day number to within the hour.
 *
 * HONESTY. A reader that has nothing true to say returns null and NO row is
 * written. `needsPms` metrics are null without a connected PMS
 * (lib/pms-link.ts): a practice with no PMS never sees a PMS number.
 */

export type MetricGranularity = 'day' | 'hour'
export type MetricScope = 'org' | 'platform'
export type MetricUnit = 'count' | 'cents'
export type MetricKind = 'flow' | 'stock'

export interface MetricDef {
  label: string
  granularity: MetricGranularity
  scope: MetricScope
  unit: MetricUnit
  kind: MetricKind
  /** Null without a connected PMS — the writer skips the row. */
  needsPms?: boolean
}

export const METRICS = {
  // The recall funnel (the Growth hub's reactivation engine).
  recall_due_reachable: { label: 'Due and reachable', granularity: 'day', scope: 'org', unit: 'count', kind: 'stock' },
  recall_sent: { label: 'Campaign messages sent', granularity: 'day', scope: 'org', unit: 'count', kind: 'flow' },
  recall_opened: { label: 'Campaign messages opened', granularity: 'day', scope: 'org', unit: 'count', kind: 'flow' },
  recall_booked: { label: 'Booked back from outreach', granularity: 'day', scope: 'org', unit: 'count', kind: 'flow' },
  // Reviews.
  reviews_requested: { label: 'Review requests created', granularity: 'day', scope: 'org', unit: 'count', kind: 'flow' },
  reviews_received: { label: 'Reviews left', granularity: 'day', scope: 'org', unit: 'count', kind: 'flow' },
  // Analytics.
  new_patients: { label: 'New patients', granularity: 'day', scope: 'org', unit: 'count', kind: 'flow' },
  visits: { label: 'Visits completed', granularity: 'day', scope: 'org', unit: 'count', kind: 'flow' },
  bookings: { label: 'Bookings made', granularity: 'day', scope: 'org', unit: 'count', kind: 'flow' },
  revenue_collected: { label: 'Collected online', granularity: 'day', scope: 'org', unit: 'cents', kind: 'flow' },
  outstanding_balance: { label: 'Outstanding balances', granularity: 'day', scope: 'org', unit: 'cents', kind: 'stock', needsPms: true },
  // The platform (UTC buckets).
  mrr: { label: 'Monthly recurring revenue', granularity: 'day', scope: 'platform', unit: 'cents', kind: 'stock' },
  active_clinics: { label: 'Active clinics', granularity: 'day', scope: 'platform', unit: 'count', kind: 'stock' },
  hunt_sent: { label: 'Prospecting emails sent', granularity: 'hour', scope: 'platform', unit: 'count', kind: 'flow' },
} as const satisfies Record<string, MetricDef>

export type MetricKey = keyof typeof METRICS

export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[]

export function metricsFor(scope: MetricScope, granularity: MetricGranularity): MetricKey[] {
  return METRIC_KEYS.filter((k) => METRICS[k].scope === scope && METRICS[k].granularity === granularity)
}

/** A tile says "since <date>" until it holds this many daily points. */
export const SERIES_FLOOR = 14

/** Said wherever a platform series is shown. */
export const PLATFORM_BUCKET_NOTE = 'Days and hours are UTC.'
