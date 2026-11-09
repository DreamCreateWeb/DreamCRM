import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ML-38 — the series read: org-scoped (or platform NULL), bounded to the
 * trailing window ending at the clinic-local yesterday, NOT zero-filled, and
 * the heartbeat words ("since <date>" under the floor; flow = week over week).
 */
vi.mock('server-only', () => ({}))

const captured: Array<{ text: string; params: unknown[] }> = []
let rows: Array<[string, string, string]> = []
vi.mock('@/lib/db', async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const client = {
    query: async (q: { text: string; values?: unknown[] } | string, values?: unknown[]) => {
      const text = typeof q === 'string' ? q : q.text
      captured.push({ text, params: values ?? (typeof q === 'string' ? [] : (q.values ?? [])) })
      return { rows, rowCount: rows.length, fields: [] }
    },
  }
  return { db: drizzle(client as never), schema }
})
vi.mock('@/lib/services/metric-readers', () => ({ ORG_READERS: {}, PLATFORM_READERS: {} }))
vi.mock('@/lib/services/billing-state', () => ({ listShutDownOrgIds: vi.fn() }))
vi.mock('@/lib/services/cron-sweep', () => ({ sweepClinics: vi.fn() }))

import { readSeries, readOrgSeriesMany } from '@/lib/services/metric-series-read'
import { heartbeatFor, shiftDayKey, bucketLabel, type SeriesPoint } from '@/lib/metric-series'

const NOW = new Date('2026-11-09T06:30:00Z') // 00:30 on Nov 9 in Chicago

beforeEach(() => {
  captured.length = 0
  rows = []
})

describe('readSeries', () => {
  it('filters by the org, the metric and the day granularity, ending at the clinic-local yesterday', async () => {
    rows = [['2026-11-07', '4', ''], ['2026-11-08', '6', '']]
    // node-postgres rowMode array: [bucket, value]
    const pts = await readSeries('org_a', 'visits', 30, { now: NOW, timeZone: 'America/Chicago' })
    const q = captured[0]
    expect(q.text).toMatch(/"organization_id" = \$1/)
    expect(q.params).toEqual(expect.arrayContaining(['org_a', 'visits', 'day', '2026-10-10', '2026-11-08']))
    expect(pts.map((p) => p.key)).toEqual(['2026-11-07', '2026-11-08'])
    expect(pts.map((p) => p.value)).toEqual([4, 6])
    expect(pts[0].bucket).toBe('Nov 7')
  })

  it('a platform series reads the NULL-org rows over UTC days', async () => {
    await readSeries(null, 'mrr', 14, { now: NOW })
    expect(captured[0].text).toMatch(/"organization_id" is null/i)
    expect(captured[0].params).toEqual(expect.arrayContaining(['mrr', 'day', '2026-11-08']))
  })

  it('the hourly metric reads hour buckets ending at the last full UTC hour', async () => {
    await readSeries(null, 'hunt_sent', 24, { now: NOW })
    expect(captured[0].params).toEqual(expect.arrayContaining(['hour', '2026-11-09T05', '2026-11-08T06']))
  })

  it('is NOT zero-filled: no recorded rows means an empty series, not a row of zeros', async () => {
    expect(await readSeries('org_a', 'visits', 30, { now: NOW, timeZone: 'America/Chicago' })).toEqual([])
  })

  it('readOrgSeriesMany groups one read by metric', async () => {
    rows = [['recall_sent', '2026-11-08', '5']] as never
    const out = await readOrgSeriesMany('org_a', ['recall_sent', 'recall_booked'], 30, { now: NOW, timeZone: 'America/Chicago' })
    expect(out.recall_sent.map((p) => p.value)).toEqual([5])
    expect(out.recall_booked).toEqual([])
    expect(captured[0].text).toMatch(/"organization_id" = \$1/)
  })
})

function days(n: number, f = (i: number) => i): SeriesPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const key = shiftDayKey('2026-10-01', i)
    return { key, bucket: bucketLabel(key), value: f(i) }
  })
}

describe('heartbeatFor', () => {
  it('under the floor a flow says "tracked since <date>" and draws the spark at 2+ points', () => {
    const h = heartbeatFor(days(3), 'flow', { noun: 'sent' })
    expect(h.spark).toHaveLength(3)
    expect(h.line).toBe('tracked since Oct 1')
  })

  it('a flow with 14 recorded days compares week over week, naming what it counts', () => {
    const h = heartbeatFor(days(14, (i) => (i < 7 ? 1 : 3)), 'flow', { noun: 'sent' })
    expect(h.line).toBe('21 sent in the last 7 days, up 14 on the week before')
  })

  it('a flow with a hole in its fortnight makes no comparison', () => {
    const pts = days(15).filter((p) => p.key !== '2026-10-05')
    expect(heartbeatFor(pts, 'flow').line).toBeNull()
  })

  it('a stock with 15 points compares against 14 days ago', () => {
    expect(heartbeatFor(days(15, (i) => 50 - i), 'stock').line).toBe('down 14 vs 14 days ago')
  })

  it('no history: no spark, no line', () => {
    expect(heartbeatFor([], 'stock')).toEqual({ spark: null, line: null })
  })
})
