import { describe, it, expect } from 'vitest'
import { bucketLabel, summarizeSeries, heartbeatLine, shiftDayKey, type SeriesPoint } from '@/lib/metric-series'

function days(n: number, start = '2026-10-01', f = (i: number) => i): SeriesPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const key = shiftDayKey(start, i)
    return { key, bucket: bucketLabel(key), value: f(i) }
  })
}

describe('summarizeSeries (the honest heartbeat)', () => {
  it('says nothing with no history, and draws no spark from one point', () => {
    expect(summarizeSeries([])).toEqual({ spark: null, latest: null, vs14: null, sinceCopy: null })
    const one = summarizeSeries(days(1))
    expect(one.spark).toBeNull()
    expect(one.sinceCopy).toBe('since Oct 1')
  })

  it('draws a spark at 2 points and says "since <date>" under the 14-day floor', () => {
    const s = summarizeSeries(days(5))
    expect(s.spark).toHaveLength(5)
    expect(summarizeSeries(days(2)).spark).toHaveLength(2)
    expect(s.vs14).toBeNull()
    expect(heartbeatLine(s)).toBe('tracked since Oct 1')
  })

  it('compares against 14 days ago once the history exists', () => {
    const s = summarizeSeries(days(15, '2026-10-01', (i) => 10 + i))
    expect(s.vs14).toEqual({ prior: 10, change: 14, pct: 140 })
    expect(s.sinceCopy).toBeNull()
    expect(heartbeatLine(s)).toBe('up 14 vs 14 days ago')
  })

  it('compares by DATE, so a skipped day never slides the comparison', () => {
    const pts = days(16, '2026-10-01').filter((p) => p.key !== '2026-10-02')
    // newest is Oct 16, 14 days back is Oct 2 (missing): no comparison is invented.
    expect(summarizeSeries(pts).vs14).toBeNull()
  })

  it('a prior of zero gives no percent, never infinity', () => {
    const s = summarizeSeries(days(15, '2026-10-01', (i) => (i === 0 ? 0 : 5)))
    expect(s.vs14?.pct).toBeNull()
  })

  it('labels day and hour buckets', () => {
    expect(bucketLabel('2026-11-08')).toBe('Nov 8')
    expect(bucketLabel('2026-11-08T15')).toBe('Nov 8, 3 PM')
    expect(bucketLabel('2026-11-08T00')).toBe('Nov 8, 12 AM')
  })
})
