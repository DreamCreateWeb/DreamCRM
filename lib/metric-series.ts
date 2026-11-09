import { SERIES_FLOOR } from '@/lib/metrics-registry'

/**
 * THE SERIES HALF OF THE HEARTBEAT (ML-38) — pure and client-safe. The
 * service (`lib/services/metric-snapshot.ts`) reads the rows; this decides
 * what a tile may SAY about them:
 *
 *  - fewer than 2 points: no spark (one dot is not a trend);
 *  - under `SERIES_FLOOR` (14) days of history: the honest "since <date>"
 *    line instead of a comparison nobody can make yet;
 *  - 14+ points: the comparison "vs 14 days ago".
 *
 * Nothing is zero-filled across history that was never recorded: a series
 * starts on its first captured day.
 */

export interface SeriesPoint {
  /** The bucket key, `YYYY-MM-DD` (day) or `YYYY-MM-DDTHH` (hour). */
  key: string
  /** Display label for the chart kit ("Nov 8", or "3 PM" for an hour). */
  bucket: string
  value: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-11-08" -> "Nov 8"; "2026-11-08T15" -> "Nov 8, 3 PM". A malformed key comes back as-is. */
export function bucketLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}))?$/.exec(key)
  if (!m) return key
  const day = `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}`
  if (m[4] === undefined) return day
  const h = Number(m[4])
  return `${day}, ${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`
}

export interface SeriesSummary {
  /** The chart-kit series, or null under 2 points. */
  spark: Array<{ bucket: string; value: number }> | null
  /** The newest recorded value, or null with no history. */
  latest: number | null
  /** The delta against the point 14 days before the newest, or null under the floor. */
  vs14: { prior: number; change: number; pct: number | null } | null
  /** "since Nov 9" while under the floor and there is any history; null otherwise. */
  sinceCopy: string | null
}

export function summarizeSeries(points: SeriesPoint[]): SeriesSummary {
  if (points.length === 0) return { spark: null, latest: null, vs14: null, sinceCopy: null }
  const latest = points[points.length - 1]
  const spark = points.length >= 2 ? points.map((p) => ({ bucket: p.bucket, value: p.value })) : null
  // "14 days ago" is by KEY, not by index: a skipped day must not slide the
  // comparison onto the wrong date.
  const priorKey = shiftDayKey(latest.key.slice(0, 10), -SERIES_FLOOR)
  const prior = points.find((p) => p.key === priorKey)
  const vs14 = prior
    ? {
        prior: prior.value,
        change: latest.value - prior.value,
        pct: prior.value === 0 ? null : Math.round(((latest.value - prior.value) / prior.value) * 100),
      }
    : null
  const sinceCopy = points.length < SERIES_FLOOR ? `since ${bucketLabel(points[0].key)}` : null
  return { spark, latest: latest.value, vs14, sinceCopy }
}

/** Shift a `YYYY-MM-DD` key by whole days (calendar arithmetic, no zone involved). */
export function shiftDayKey(key: string, days: number): string {
  const [y, mo, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10)
}

/** The one-line "vs 14 days ago" / "since <date>" a tile whispers under its number. Null = say nothing. */
export function heartbeatLine(s: SeriesSummary, fmt: (n: number) => string = (n) => n.toLocaleString('en-US')): string | null {
  if (s.vs14) {
    if (s.vs14.change === 0) return 'same as 14 days ago'
    const sign = s.vs14.change > 0 ? 'up' : 'down'
    return `${sign} ${fmt(Math.abs(s.vs14.change))} vs 14 days ago`
  }
  return s.sinceCopy ? `tracked ${s.sinceCopy}` : null
}

/**
 * A FLOW (sends, bookings, new patients) is lumpy day to day, so "vs 14 days
 * ago" would compare one Tuesday with another. A flow's comparison is the
 * last 7 recorded days against the 7 before them — and only when ALL 14 days
 * were recorded (an unrecorded day is unknown, never a zero).
 */
export function weekOverWeek(points: SeriesPoint[]): { thisWeek: number; priorWeek: number } | null {
  if (points.length < 2 * 7) return null
  const byKey = new Map(points.map((p) => [p.key, p.value]))
  const newest = points[points.length - 1].key
  let thisWeek = 0
  let priorWeek = 0
  for (let i = 0; i < 14; i++) {
    const v = byKey.get(shiftDayKey(newest, -i))
    if (v === undefined) return null
    if (i < 7) thisWeek += v
    else priorWeek += v
  }
  return { thisWeek, priorWeek }
}

export interface Heartbeat {
  /** The chart-kit series for the tile's one heartbeat, or null (under 2 points). */
  spark: Array<{ bucket: string; value: number }> | null
  /** The honest line under the number, or null to say nothing. */
  line: string | null
}

/**
 * Everything a tile needs from a series, in one call: the spark at 2+ points
 * and the line — the 14-day comparison for a stock, the week-over-week for a
 * flow, and under the floor the honest "tracked since <date>".
 */
export function heartbeatFor(
  points: SeriesPoint[],
  kind: 'flow' | 'stock',
  opts: { fmt?: (n: number) => string; /** What a flow counts, for the line ("sent", "booked back"). */ noun?: string } = {},
): Heartbeat {
  const fmt = opts.fmt ?? ((n: number) => n.toLocaleString('en-US'))
  const s = summarizeSeries(points)
  if (kind === 'stock') return { spark: s.spark, line: heartbeatLine(s, fmt) }
  const w = weekOverWeek(points)
  if (!w) return { spark: s.spark, line: s.sinceCopy ? `tracked ${s.sinceCopy}` : null }
  const diff = w.thisWeek - w.priorWeek
  const vs = diff === 0 ? 'same as the week before' : `${diff > 0 ? 'up' : 'down'} ${fmt(Math.abs(diff))} on the week before`
  return { spark: s.spark, line: `${fmt(w.thisWeek)}${opts.noun ? ` ${opts.noun}` : ''} in the last 7 days, ${vs}` }
}

/**
 * The HOURLY series' heartbeat (the platform's hunt panel): the spark at 2+
 * points and, until a full day of hours exists, the honest "tracked since
 * <hour>". No comparison is made on hourly data — the 24-hour spark IS the
 * story — and hour keys never go through the day arithmetic above.
 */
export function hourlyHeartbeat(points: SeriesPoint[], windowHours = 24): Heartbeat {
  if (points.length === 0) return { spark: null, line: null }
  return {
    spark: points.length >= 2 ? points.map((p) => ({ bucket: p.bucket, value: p.value })) : null,
    line: points.length < windowHours ? `tracked since ${bucketLabel(points[0].key)}` : null,
  }
}
