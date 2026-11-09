import 'server-only'
import { and, asc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicDayStart, resolveClinicTimeZone } from '@/lib/clinic-timezone'
import { clinicDayKey } from '@/lib/format-datetime'
import { METRICS, metricsFor, type MetricKey } from '@/lib/metrics-registry'
import { bucketLabel, shiftDayKey, type SeriesPoint } from '@/lib/metric-series'
import { ORG_READERS, PLATFORM_READERS } from '@/lib/services/metric-readers'
import { listShutDownOrgIds } from '@/lib/services/billing-state'
import { sweepClinics } from '@/lib/services/cron-sweep'
import type { SweepProgress } from '@/lib/cron-budget'

/**
 * THE DAILY METRICS SNAPSHOT — the writer + the series read (ML-38).
 *
 * Rides the hourly daily-digest tick (no route of its own). Each tick, every
 * clinic is asked "is yesterday, on YOUR calendar, recorded?" — the first tick
 * after a clinic's local midnight finds it is not and writes it; every tick
 * after finds it is and costs one indexed read. Writes are upserts keyed on
 * (org, metric, bucket, granularity), so a resumed or doubled tick is
 * harmless; only metrics MISSING for the bucket are computed, so a crash
 * midway finishes the rest next tick.
 *
 * NO BACKFILL. History starts the day this ships; tiles say "since <date>"
 * until 14 points exist. A reader that returns null (no PMS, Stripe down)
 * writes NO row: a gap is a gap, never a zero.
 *
 * Platform-global rows (organization_id NULL) are bucketed in UTC days and
 * UTC hours — there is no clinic to be local to — and the tiles say so.
 * Demo clinics are written like any clinic (their readers run on their own
 * data); the seeder does not fabricate history. Shut-down (walled) clinics
 * are skipped.
 */

const HOUR_MS = 60 * 60 * 1000
/** Hourly rows are a rolling window, not a ledger. */
export const HOURLY_RETENTION_DAYS = 14

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

type Write = { organizationId: string | null; metric: MetricKey; bucket: string; granularity: 'day' | 'hour'; value: number }

/** The ONE upsert. Org rows and platform (NULL-org) rows carry different unique indexes. */
export async function upsertSnapshot(w: Write): Promise<void> {
  const values = {
    organizationId: w.organizationId,
    metric: w.metric,
    bucket: w.bucket,
    granularity: w.granularity,
    value: w.value,
    capturedAt: new Date(),
  }
  const set = { value: w.value, capturedAt: values.capturedAt }
  if (w.organizationId === null) {
    await db
      .insert(schema.metricSnapshot)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.metricSnapshot.metric, schema.metricSnapshot.bucket, schema.metricSnapshot.granularity],
        targetWhere: sql`${schema.metricSnapshot.organizationId} IS NULL`,
        set,
      })
  } else {
    await db
      .insert(schema.metricSnapshot)
      .values(values)
      .onConflictDoUpdate({
        target: [
          schema.metricSnapshot.organizationId,
          schema.metricSnapshot.metric,
          schema.metricSnapshot.bucket,
          schema.metricSnapshot.granularity,
        ],
        set,
      })
  }
}

async function recordedMetrics(organizationId: string | null, bucket: string, granularity: 'day' | 'hour'): Promise<Set<string>> {
  const rows = await db
    .select({ metric: schema.metricSnapshot.metric })
    .from(schema.metricSnapshot)
    .where(
      and(
        organizationId === null ? isNull(schema.metricSnapshot.organizationId) : eq(schema.metricSnapshot.organizationId, organizationId),
        eq(schema.metricSnapshot.bucket, bucket),
        eq(schema.metricSnapshot.granularity, granularity),
      ),
    )
  return new Set(rows.map((r) => r.metric))
}

/** Record one org's missing 'day' metrics for its clinic-local yesterday. Returns rows written. */
export async function captureOrgDay(organizationId: string, timeZone: string | null | undefined, now: Date): Promise<number> {
  const win = clinicYesterdayWindow(now, timeZone)
  const have = await recordedMetrics(organizationId, win.bucket, 'day')
  let written = 0
  for (const metric of metricsFor('org', 'day')) {
    if (have.has(metric)) continue
    const reader = ORG_READERS[metric as keyof typeof ORG_READERS]
    let value: number | null
    try {
      value = await reader({ organizationId, from: win.from, to: win.to })
    } catch (e) {
      // One broken reader never takes the others down; it retries next tick.
      console.warn(`[metric-snapshot] ${metric} unreadable for ${organizationId}`, e)
      continue
    }
    if (value === null || !Number.isFinite(value)) continue
    await upsertSnapshot({ organizationId, metric, bucket: win.bucket, granularity: 'day', value })
    written++
  }
  return written
}

async function capturePlatform(win: BucketWindow, granularity: 'day' | 'hour'): Promise<number> {
  const have = await recordedMetrics(null, win.bucket, granularity)
  let written = 0
  for (const metric of metricsFor('platform', granularity)) {
    if (have.has(metric)) continue
    const reader = PLATFORM_READERS[metric as keyof typeof PLATFORM_READERS]
    let value: number | null
    try {
      value = await reader({ from: win.from, to: win.to })
    } catch (e) {
      console.warn(`[metric-snapshot] platform ${metric} unreadable`, e)
      continue
    }
    if (value === null || !Number.isFinite(value)) continue
    await upsertSnapshot({ organizationId: null, metric, bucket: win.bucket, granularity, value })
    written++
  }
  return written
}

export interface SnapshotRunResult {
  clinicsWritten: number
  rowsWritten: number
  platformDay: number
  platformHour: number
  pruned: number
  sweep: SweepProgress
}

/**
 * One tick of the writer. Daily pass (every clinic's own yesterday + the
 * platform's UTC yesterday) and the hourly pass (the platform's last full
 * UTC hour), then the hourly retention prune. Budgeted + resumable.
 */
export async function runMetricSnapshots(now: Date = new Date()): Promise<SnapshotRunResult> {
  const clinics = await db
    .select({
      organizationId: schema.clinicProfile.organizationId,
      timezone: schema.clinicProfile.timezone,
    })
    .from(schema.clinicProfile)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.clinicProfile.organizationId))
    .where(eq(schema.organization.type, 'clinic'))
  const shutDown = await listShutDownOrgIds(now)
  const live = clinics.filter((c): c is typeof c & { organizationId: string } => !!c.organizationId && !shutDown.has(c.organizationId))

  let clinicsWritten = 0
  let rowsWritten = 0
  const sweep = await sweepClinics(
    'metric-snapshot',
    live,
    (c) => c.organizationId,
    async (c) => {
      const n = await captureOrgDay(c.organizationId, c.timezone, now)
      if (n > 0) {
        clinicsWritten++
        rowsWritten += n
      }
    },
    { onError: (c, err) => console.warn(`[metric-snapshot] ${c.organizationId} failed`, err) },
  )

  const platformDay = await capturePlatform(utcYesterdayWindow(now), 'day').catch((e) => {
    console.warn('[metric-snapshot] platform day pass failed', e)
    return 0
  })
  const platformHour = await capturePlatform(utcPreviousHourWindow(now), 'hour').catch((e) => {
    console.warn('[metric-snapshot] platform hour pass failed', e)
    return 0
  })
  const pruned = await pruneHourly(now).catch(() => 0)
  return { clinicsWritten, rowsWritten, platformDay, platformHour, pruned, sweep }
}

/** Drop hourly rows past their rolling window (hourly is not a ledger). */
export async function pruneHourly(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - HOURLY_RETENTION_DAYS * 24 * HOUR_MS)
  const gone = await db
    .delete(schema.metricSnapshot)
    .where(and(eq(schema.metricSnapshot.granularity, 'hour'), lt(schema.metricSnapshot.capturedAt, cutoff)))
    .returning({ id: schema.metricSnapshot.id })
  return gone.length
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
