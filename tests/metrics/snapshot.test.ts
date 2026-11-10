import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ML-38 — the writer. The REAL drizzle query builder + dialect render the
 * statements (a fake pg client captures the SQL text, no database), so the
 * ON CONFLICT clause is the one Postgres will actually parse; the metric
 * readers are stubbed so the pass's own logic (the clinic-local bucket,
 * idempotence, honest nulls, the cursor job) is what is under test.
 */
vi.mock('server-only', () => ({}))

const captured: Array<{ text: string; params: unknown[] }> = []
let existing: string[] = []

vi.mock('@/lib/db', async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const client = {
    query: async (q: { text: string; values: unknown[] } | string, values?: unknown[]) => {
      const text = typeof q === 'string' ? q : q.text
      const params = values ?? (typeof q === 'string' ? [] : (q.values ?? []))
      captured.push({ text, params })
      // The "which metrics are already recorded" read answers from `existing`.
      if (/^select "metric"/i.test(text)) return { rows: existing.map((m) => [m]), rowCount: existing.length, fields: [] }
      return { rows: [], rowCount: 0, fields: [] }
    },
  }
  return { db: drizzle(client as never), schema }
})

const readers = vi.hoisted(() => ({
  org: {} as Record<string, (ctx: unknown) => Promise<number | null>>,
  platform: {} as Record<string, (ctx: unknown) => Promise<number | null>>,
}))
vi.mock('@/lib/services/metric-readers', () => ({ ORG_READERS: readers.org, PLATFORM_READERS: readers.platform }))
vi.mock('@/lib/services/billing-state', () => ({ listShutDownOrgIds: vi.fn(async () => new Set<string>()) }))
const strikes = vi.hoisted(() => ({ calls: [] as Array<[string, string]> }))
vi.mock('@/lib/services/engine-failures', () => ({
  reportAutomationFailure: vi.fn(async (org: string, key: string) => {
    strikes.calls.push([org, key])
    return true
  }),
}))
const sweepSpy = vi.hoisted(() => vi.fn())
vi.mock('@/lib/services/cron-sweep', () => ({
  sweepClinics: sweepSpy,
}))

import { METRIC_KEYS, metricsFor } from '@/lib/metrics-registry'
import {
  captureOrgDay,
  clinicYesterdayWindow,
  utcYesterdayWindow,
  utcPreviousHourWindow,
  upsertSnapshot,
  runMetricSnapshots,
} from '@/lib/services/metric-snapshot'

const inserts = () => captured.filter((c) => /^insert into "metric_snapshot"/i.test(c.text))

beforeEach(() => {
  captured.length = 0
  existing = []
  for (const k of METRIC_KEYS) {
    readers.org[k] = async () => 7
    readers.platform[k] = async () => 9
  }
  sweepSpy.mockReset()
  strikes.calls.length = 0
})

describe('buckets are in the right calendar', () => {
  it('a Chicago clinic at 00:30 local on Nov 9 records Nov 8, bounded by ITS midnights', () => {
    // 2026-11-09T06:30Z = 00:30 CST (UTC-6) on Nov 9.
    const w = clinicYesterdayWindow(new Date('2026-11-09T06:30:00Z'), 'America/Chicago')
    expect(w.bucket).toBe('2026-11-08')
    expect(w.from.toISOString()).toBe('2026-11-08T06:00:00.000Z')
    expect(w.to.toISOString()).toBe('2026-11-09T06:00:00.000Z')
  })

  it('the same instant is still Nov 8 locally for Los Angeles, so its yesterday is Nov 7', () => {
    const w = clinicYesterdayWindow(new Date('2026-11-09T06:30:00Z'), 'America/Los_Angeles')
    expect(w.bucket).toBe('2026-11-07')
  })

  it('the platform buckets are UTC days and UTC hours', () => {
    const now = new Date('2026-11-09T06:30:00Z')
    expect(utcYesterdayWindow(now).bucket).toBe('2026-11-08')
    const h = utcPreviousHourWindow(now)
    expect(h.bucket).toBe('2026-11-09T05')
    expect(h.to.toISOString()).toBe('2026-11-09T06:00:00.000Z')
  })
})

describe('upsert SQL, rendered through the real dialect', () => {
  it('an org row conflicts on (org, metric, bucket, granularity) and updates in place', async () => {
    await upsertSnapshot({ organizationId: 'org_a', metric: 'visits', bucket: '2026-11-08', granularity: 'day', value: 4 })
    const [i] = inserts()
    expect(i.text).toMatch(/on conflict \("organization_id","metric","bucket","granularity"\) do update set "value" = /i)
    expect(i.params).toContain('org_a')
  })

  it('a platform row conflicts on its own PARTIAL index (organization_id IS NULL)', async () => {
    await upsertSnapshot({ organizationId: null, metric: 'mrr', bucket: '2026-11-08', granularity: 'day', value: 20000 })
    const [i] = inserts()
    expect(i.text).toMatch(/on conflict \("metric","bucket","granularity"\) where .*"organization_id" IS NULL do update/i)
  })
})

describe('captureOrgDay', () => {
  const now = new Date('2026-11-09T06:30:00Z')

  it('writes every org-scoped day metric for the clinic-local yesterday, each carrying the org', async () => {
    const n = await captureOrgDay('org_a', 'America/Chicago', now)
    expect(n).toBe(metricsFor('org', 'day').length)
    const rows = inserts()
    expect(rows).toHaveLength(n)
    for (const r of rows) {
      expect(r.params).toContain('org_a')
      expect(r.params).toContain('2026-11-08')
    }
  })

  it('is idempotent: with the day already recorded a second pass computes and writes nothing', async () => {
    existing = metricsFor('org', 'day')
    const spy = vi.fn(async () => 1)
    for (const k of metricsFor('org', 'day')) readers.org[k] = spy
    expect(await captureOrgDay('org_a', 'America/Chicago', now)).toBe(0)
    expect(spy).not.toHaveBeenCalled()
    expect(inserts()).toHaveLength(0)
  })

  it('finishes a half-recorded day: only the missing metrics are computed', async () => {
    const all = metricsFor('org', 'day')
    existing = all.slice(0, all.length - 2)
    expect(await captureOrgDay('org_a', 'America/Chicago', now)).toBe(2)
  })

  it('writes NO row when the source has nothing honest to say (null), and survives a throwing reader', async () => {
    readers.org.outstanding_balance = async () => null
    readers.org.visits = async () => {
      throw new Error('boom')
    }
    const n = await captureOrgDay('org_a', 'America/Chicago', now)
    expect(n).toBe(metricsFor('org', 'day').length - 2)
    const metricsWritten = inserts().map((r) => r.params[1])
    expect(metricsWritten).not.toContain('outstanding_balance')
    expect(metricsWritten).not.toContain('visits')
    // The broken reader costs its clinic a strike under metric_snapshot.
    expect(strikes.calls).toEqual([['org_a', 'metric_snapshot']])
  })
})

describe('the tick', () => {
  it('walks the clinics through the budgeted, resumable sweep under its own cursor key', async () => {
    sweepSpy.mockResolvedValue({ completed: true, swept: 0, remaining: 0, resumeAt: null })
    const r = await runMetricSnapshots(new Date('2026-11-09T06:30:00Z'))
    expect(sweepSpy).toHaveBeenCalledTimes(1)
    expect(sweepSpy.mock.calls[0][0]).toBe('metric-snapshot')
    // The platform passes ran (day + hour) even with no clinics.
    expect(r.platformDay).toBe(metricsFor('platform', 'day').length)
    expect(r.platformHour).toBe(metricsFor('platform', 'hour').length)
  })

  it('a clinic whose pass throws is one strike under metric_snapshot (onError), never a stop', async () => {
    sweepSpy.mockResolvedValue({ completed: true, swept: 0, remaining: 0, resumeAt: null })
    await runMetricSnapshots(new Date('2026-11-09T06:30:00Z'))
    const opts = sweepSpy.mock.calls[0][4] as { onError: (c: { organizationId: string }, e: unknown) => void }
    opts.onError({ organizationId: 'org_z' }, new Error('x'))
    await Promise.resolve()
    expect(strikes.calls).toEqual([['org_z', 'metric_snapshot']])
  })
})
