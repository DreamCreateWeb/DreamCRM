import 'server-only'
import { and, asc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicDayStart, resolveClinicTimeZone } from '@/lib/clinic-timezone'
import { clinicDayKey } from '@/lib/format-datetime'
import { METRICS, type MetricKey } from '@/lib/metrics-registry'
import { bucketLabel, shiftDayKey, heartbeatFor, hourlyHeartbeat, type Heartbeat, type SeriesPoint } from '@/lib/metric-series'

/**
 * THE SERIES READ (ML-38) — the light half of the metrics snapshot: the
 * bucket windows (clinic-local days for an org, UTC days/hours for the
 * platform) and the trailing-series reads every tile uses. Split from the
 * writer (`metric-snapshot.ts`, which drags in every reader) so a page that
 * only draws a heartbeat imports a small graph.
 */

const HOUR_MS = 60 * 60 * 1000

export interface BucketWindow {
  /** The bucket key: clinic-local `YYYY-MM-DD` (org) / UTC `YYYY-MM-DD` or `YYYY-MM-DDTHH`. */
  bucket: string
  from: Date
  to: Date
}

/** Yesterday on the clinic's own calendar: the window the daily pass records. Pure. */
export function clinicYesterdayWindow(now: Date, timeZone: string | null | undefined): BucketWindow {
  const tz = resolveClinicTimeZone(timeZone)
  const from = clinicDayStart(now, tz, -1)
  const to = clinicDayStart(now, tz, 0)
  return { bucket: clinicDayKey(from, tz), from, to }
}

/** Yesterday in UTC — the platform's day bucket. Pure. */
export function utcYesterdayWindow(now: Date): BucketWindow {
  const today = now.toISOString().slice(0, 10)
  const bucket = shiftDayKey(today, -1)
  return { bucket, from: new Date(`${bucket}T00:00:00.000Z`), to: new Date(`${today}T00:00:00.000Z`) }
}

/** The last COMPLETED UTC hour — the platform's hour bucket. Pure. */
export function utcPreviousHourWindow(now: Date): BucketWindow {
  const to = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS)
  const from = new Date(to.getTime() - HOUR_MS)
  return { bucket: from.toISOString().slice(0, 13), from, to }
}

/**
 * The trailing `days` of one metric for a tile, oldest first. Org series end
 * at the clinic-local yesterday; platform series (`organizationId` null) end
 * at the UTC yesterday (or the previous UTC hour for the hourly metric, where
 * `days` counts hours). NOT zero-filled: a bucket nothing recorded is absent,
 * and the series starts on its first captured bucket — so a tile can say
 * "since <date>" truthfully (lib/metric-series.ts decides the words).
 */
export async function readSeries(
  organizationId: string | null,
  metric: MetricKey,
  days: number,
  opts?: { now?: Date; timeZone?: string | null },
): Promise<SeriesPoint[]> {
  const def = METRICS[metric]
  const now = opts?.now ?? new Date()
  let last: string
  let first: string
  if (def.granularity === 'hour') {
    last = utcPreviousHourWindow(now).bucket
    first = new Date(new Date(`${last}:00:00.000Z`).getTime() - (days - 1) * HOUR_MS).toISOString().slice(0, 13)
  } else {
    last = organizationId === null ? utcYesterdayWindow(now).bucket : clinicYesterdayWindow(now, opts?.timeZone).bucket
    first = shiftDayKey(last, -(days - 1))
  }
  const rows = await db
    .select({ bucket: schema.metricSnapshot.bucket, value: schema.metricSnapshot.value })
    .from(schema.metricSnapshot)
    .where(
      and(
        organizationId === null ? isNull(schema.metricSnapshot.organizationId) : eq(schema.metricSnapshot.organizationId, organizationId),
        eq(schema.metricSnapshot.metric, metric),
        eq(schema.metricSnapshot.granularity, def.granularity),
        gte(schema.metricSnapshot.bucket, first),
        sql`${schema.metricSnapshot.bucket} <= ${last}`,
      ),
    )
    .orderBy(asc(schema.metricSnapshot.bucket))
  return rows.map((r) => ({ key: r.bucket, bucket: bucketLabel(r.bucket), value: Number(r.value) }))
}

/** Several metrics for one org in ONE read — what a page with a row of tiles asks. */
export async function readOrgSeriesMany<K extends MetricKey>(
  organizationId: string,
  metrics: K[],
  days: number,
  opts?: { now?: Date; timeZone?: string | null },
): Promise<Record<K, SeriesPoint[]>> {
  const out = {} as Record<K, SeriesPoint[]>
  if (metrics.length === 0) return out
  const now = opts?.now ?? new Date()
  const last = clinicYesterdayWindow(now, opts?.timeZone).bucket
  const first = shiftDayKey(last, -(days - 1))
  const rows = await db
    .select({ metric: schema.metricSnapshot.metric, bucket: schema.metricSnapshot.bucket, value: schema.metricSnapshot.value })
    .from(schema.metricSnapshot)
    .where(
      and(
        eq(schema.metricSnapshot.organizationId, organizationId),
        inArray(schema.metricSnapshot.metric, metrics),
        eq(schema.metricSnapshot.granularity, 'day'),
        gte(schema.metricSnapshot.bucket, first),
        sql`${schema.metricSnapshot.bucket} <= ${last}`,
      ),
    )
    .orderBy(asc(schema.metricSnapshot.bucket))
  for (const m of metrics) out[m] = []
  for (const r of rows) out[r.metric as K].push({ key: r.bucket, bucket: bucketLabel(r.bucket), value: Number(r.value) })
  return out
}

/**
 * What a row of tiles asks for: each metric's heartbeat (kit spark series +
 * the honest line) for one org, in ONE read, with the registry's own kind
 * (stock vs flow) choosing the words. Callers `.catch(() => null)` — a failed
 * read costs the tile its spark, never the page.
 */
export async function getOrgHeartbeats<K extends MetricKey>(
  organizationId: string,
  timeZone: string,
  metrics: K[],
  opts?: { days?: number; now?: Date; nouns?: Partial<Record<K, string>>; fmt?: (n: number) => string },
): Promise<Record<K, Heartbeat>> {
  const series = await readOrgSeriesMany(organizationId, metrics, opts?.days ?? 30, { now: opts?.now, timeZone })
  const out = {} as Record<K, Heartbeat>
  for (const m of metrics) out[m] = heartbeatFor(series[m], METRICS[m].kind, { noun: opts?.nouns?.[m], fmt: opts?.fmt })
  return out
}

/** The platform's heartbeat for one metric (UTC buckets — the tile says so). */
export async function getPlatformHeartbeat(
  metric: MetricKey,
  opts?: { days?: number; now?: Date; fmt?: (n: number) => string },
): Promise<Heartbeat> {
  const hourly = METRICS[metric].granularity === 'hour'
  // For an hourly metric `days` counts HOURS (24 by default).
  const points = await readSeries(null, metric, opts?.days ?? (hourly ? 24 : 30), { now: opts?.now })
  if (hourly) return hourlyHeartbeat(points, opts?.days ?? 24)
  return heartbeatFor(points, METRICS[metric].kind, { fmt: opts?.fmt })
}
