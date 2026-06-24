import { describe, it, expect, vi, beforeEach } from 'vitest'

const q: { queue: unknown[][] } = { queue: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const c: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy', 'limit']) c[m] = () => c
    c.then = (resolve: (v: unknown) => void) => resolve(q.queue.shift() ?? [])
    return c
  }
  return { db: { select: () => chain() }, schema: new Proxy({}, { get: () => new Proxy({}, { get: () => ({}) }) }) }
})

const getReviewStatsMock = vi.fn(async (_org: string, windowDays = 30) => ({
  windowDays,
  sent30d: 10,
  completed30d: 4,
  // `clicked30d` is the REAL measured open-the-link count (5), distinct
  // from clickRate30d (50%). The analytics Reputation band must surface
  // the measured count, not reconstruct `round(sent * rate)`.
  clicked30d: 5,
  clickRate30d: 50,
  completionRate30d: 40,
  eligibleCount: 5,
  byPlatform: { google: 3, healthgrades: 1, facebook: 0, yelp: 0 },
  pending: 2,
}))
vi.mock('@/lib/services/reviews', () => ({
  getReviewStats: (org: string, windowDays?: number) => getReviewStatsMock(org, windowDays),
}))
vi.mock('@/lib/services/patients', () => ({
  listPatients: vi.fn(async () => [{ recallStatus: 'due' }, { recallStatus: 'overdue' }, { recallStatus: 'na' }]),
}))
vi.mock('@/lib/services/gsc', () => ({
  getClinicSeoPerformance: vi.fn(async () => ({
    perf: { clicks: 120, impressions: 0, ctr: 0, position: 0, topQueries: [] },
    platformConnected: true,
    customDomain: false,
    scopeLabel: '/site/acme',
  })),
}))
// GBP local metrics is its own service (mocked so it doesn't touch the db queue
// the chain above shifts through). Default: a connected snapshot.
const gbpMetricsMock = vi.fn(async () => ({
  connected: true,
  impressions: 3000,
  calls: 25,
  directions: 30,
  websiteClicks: 80,
  bookings: 8,
  topKeywords: [],
  windowDays: 30,
}))
vi.mock('@/lib/services/gbp-metrics', () => ({
  getGbpLocalMetrics: (...a: unknown[]) => gbpMetricsMock(...(a as [])),
}))

import { getClinicAnalytics, weeklyTrend } from '@/lib/services/analytics'

beforeEach(() => {
  q.queue.length = 0
  getReviewStatsMock.mockClear()
  gbpMetricsMock.mockClear()
})

/** Seed the DB query queue with a minimal happy-path so getClinicAnalytics
 *  runs end-to-end. Order matches the service's query sequence. */
function seedHappyPath() {
  q.queue.push([]) // 1. newPatientRows
  q.queue.push([]) // 2. prevNewPatients (rows, filtered in JS)
  q.queue.push([]) // 3. leadRows
  q.queue.push([]) // 4. apptRows
  q.queue.push([{ id: 1 }]) // 5. patientCampaigns
  q.queue.push([]) // 6. eventRows
}

describe('weeklyTrend', () => {
  it('buckets dates by week oldest→newest and counts within the window', () => {
    const now = new Date('2026-05-27T12:00:00Z')
    const d = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000)
    // windowDays 28 → 4 weekly buckets. Put 2 in this week, 1 last week, and
    // one outside the window (35d) which must be ignored.
    const out = weeklyTrend([d(1), d(3), d(8), d(35)], 28, now)
    expect(out).toHaveLength(4)
    expect(out[out.length - 1].count).toBe(2) // most recent week (oldest→newest, so last)
    expect(out[out.length - 2].count).toBe(1)
    expect(out.reduce((s, p) => s + p.count, 0)).toBe(3) // 35d one excluded
  })
})

describe('getClinicAnalytics', () => {
  it('aggregates acquisition, schedule rates, funnels, recall and reputation', async () => {
    const now = Date.now()
    const recent = new Date(now - 5 * 86400000)
    const apptTime = new Date(now - 10 * 86400000)

    // Queue results in the service's query order.
    q.queue.push([
      { firstSeenAt: recent, source: 'booking_widget' },
      { firstSeenAt: recent, source: 'lead_form' },
      { firstSeenAt: recent, source: 'booking_widget' },
    ]) // 1. newPatientRows
    q.queue.push([{ source: 'booking_widget' }]) // 2. prevNewPatients (1 acquired)
    q.queue.push([
      { status: 'converted', contactedAt: recent, convertedAt: recent },
      { status: 'contacted', contactedAt: recent, convertedAt: null },
      { status: 'new', contactedAt: null, convertedAt: null },
    ]) // 3. leadRows
    // (getGscPerformance is mocked)
    q.queue.push([
      ...Array(6).fill({ status: 'completed', source: 'manual', providerId: 'prov1', startTime: apptTime, confirmedAt: recent }),
      ...Array(2).fill({ status: 'no_show', source: 'phone', providerId: 'prov1', startTime: apptTime, confirmedAt: null }),
      ...Array(2).fill({ status: 'cancelled', source: 'manual', providerId: 'prov1', startTime: apptTime, confirmedAt: null }),
    ]) // 4. apptRows
    q.queue.push([{ id: 'prov1', name: 'Dr. Reyes' }]) // 5. providers
    // (listPatients mocked)
    q.queue.push([{ id: 1 }]) // 6. patientCampaigns
    q.queue.push([{ type: 'sent' }, { type: 'sent' }, { type: 'open' }, { type: 'click' }, { type: 'booked' }]) // 7. eventRows
    // (getReviewStats mocked)

    const a = await getClinicAnalytics('org_1', 30)

    // Acquisition
    expect(a.acquisition.newPatients).toBe(3)
    expect(a.acquisition.newPatientsPrev).toBe(1)
    expect(a.acquisition.sourceMix[0]).toEqual({ source: 'booking_widget', count: 2 })
    expect(a.acquisition.websiteFunnel).toEqual({ clicks: 120, leads: 3, contacted: 2, converted: 1 })
    // GBP local actions surface (sourced from the mocked getGbpLocalMetrics).
    expect(a.acquisition.gbp).toEqual({ connected: true, impressions: 3000, calls: 25, directions: 30, bookings: 8 })
    expect(gbpMetricsMock).toHaveBeenCalledWith('org_1', { days: 30 })

    // Schedule rates
    expect(a.schedule.total).toBe(10)
    expect(a.schedule.completed).toBe(6)
    expect(a.schedule.noShow).toBe(2)
    expect(a.schedule.noShowRate).toBeCloseTo(0.25) // 2 / (6 + 2)
    expect(a.schedule.cancellationRate).toBeCloseTo(0.2) // 2 / 10
    expect(a.schedule.byProvider[0]).toEqual({ provider: 'Dr. Reyes', count: 10 })

    // Recall + outreach
    expect(a.recall.due).toBe(2) // due + overdue from listPatients mock
    expect(a.recall.outreach).toEqual({ sent: 2, opened: 1, clicked: 1, booked: 1 })

    // Reputation
    expect(a.reputation.sent).toBe(10)
    expect(a.reputation.completed).toBe(4)
    expect(a.reputation.byPlatform.google).toBe(3)
    // `opened` is the REAL measured open count (clicked30d=5), NOT
    // round(sent * clickRate) = round(10 * 0.5) = 5 — which would collide here
    // by coincidence. Prove it tracks clicked30d, not the reconstruction, by
    // also asserting it equals the mock's clicked30d exactly.
    expect(a.reputation.opened).toBe(5)
  })
})

describe('getClinicAnalytics — acquisition excludes bulk imports', () => {
  it('does NOT count PMS/CSV-imported patients as "new" (their firstSeenAt is the import time)', async () => {
    const recent = new Date(Date.now() - 3 * 86400000)
    q.queue.push([
      { firstSeenAt: recent, source: 'booking_widget' },
      { firstSeenAt: recent, source: 'pms_import' }, // bulk PMS backfill — excluded
      { firstSeenAt: recent, source: 'import' }, // CSV backfill — excluded
      { firstSeenAt: recent, source: null }, // unknown source — still counted
    ]) // 1. newPatientRows
    q.queue.push([
      { source: 'pms_import' },
      { source: 'lead_form' },
    ]) // 2. prevNewPatients → only lead_form counts (1)
    q.queue.push([]) // 3. leadRows
    q.queue.push([]) // 4. apptRows
    q.queue.push([{ id: 1 }]) // 5. patientCampaigns
    q.queue.push([]) // 6. eventRows

    const a = await getClinicAnalytics('org_1', 30)
    // 4 rows in window, but the 2 import rows are excluded → 2 acquired.
    expect(a.acquisition.newPatients).toBe(2)
    expect(a.acquisition.newPatientsPrev).toBe(1)
    // The source mix never shows a bulk-import source.
    const sources = a.acquisition.sourceMix.map((s) => s.source)
    expect(sources).not.toContain('pms_import')
    expect(sources).not.toContain('import')
    expect(sources).toContain('booking_widget')
    expect(sources).toContain('unknown') // the null-source row
  })
})

describe('getClinicAnalytics — prior-window schedule comparison', () => {
  it('splits the appointment pull into current + prior windows for the "vs previous" deltas', async () => {
    const now = Date.now()
    const cur = new Date(now - 5 * 86400000) // in the current 30-day window
    const prior = new Date(now - 40 * 86400000) // in the prior window (30–60d)

    q.queue.push([]) // 1. newPatientRows
    q.queue.push([]) // 2. prevNewPatients
    q.queue.push([]) // 3. leadRows
    q.queue.push([
      // Current window: 1 completed + 1 no-show → no-show rate 0.5
      { status: 'completed', source: null, providerId: null, startTime: cur, confirmedAt: cur },
      { status: 'no_show', source: null, providerId: null, startTime: cur, confirmedAt: null },
      // Prior window: 4 completed, 0 no-show → no-show rate 0
      ...Array(4).fill({ status: 'completed', source: null, providerId: null, startTime: prior, confirmedAt: prior }),
    ]) // 4. apptRows (current + prior, split in JS)
    q.queue.push([{ id: 1 }]) // 5. patientCampaigns (no provider query — providerId null)
    q.queue.push([]) // 6. eventRows

    const a = await getClinicAnalytics('org_1', 30)
    // Current window only for the headline numbers.
    expect(a.schedule.total).toBe(2)
    expect(a.schedule.noShowRate).toBeCloseTo(0.5)
    // Prior window computed separately for the comparison.
    expect(a.schedule.prev.total).toBe(4)
    expect(a.schedule.prev.noShowRate).toBe(0)
  })
})

describe('getClinicAnalytics — reputation window + honesty', () => {
  it('threads windowDays into getReviewStats (30 and 90 produce different scoped reads)', async () => {
    seedHappyPath()
    await getClinicAnalytics('org_1', 30)
    expect(getReviewStatsMock).toHaveBeenLastCalledWith('org_1', 30)

    seedHappyPath()
    await getClinicAnalytics('org_1', 90)
    expect(getReviewStatsMock).toHaveBeenLastCalledWith('org_1', 90)
  })

  it('exposes the measured opened count, not a rate-reconstructed one', async () => {
    // Make round(sent * clickRate) DIVERGE from the real clicked count so the
    // test fails loudly if anyone reintroduces the `round(sent * rate)` hack.
    getReviewStatsMock.mockImplementationOnce(async (_org: string, windowDays = 30) => ({
      windowDays,
      sent30d: 9,
      completed30d: 1,
      clicked30d: 4, // the truth
      clickRate30d: 50, // round(9 * 0.5) = 5 ≠ 4 — the reconstruction would be wrong
      completionRate30d: 25,
      eligibleCount: 0,
      byPlatform: { google: 0, healthgrades: 0, facebook: 0, yelp: 0 },
      pending: 0,
    }))
    seedHappyPath()
    const a = await getClinicAnalytics('org_1', 30)
    expect(a.reputation.opened).toBe(4) // the measured value, not 5
    expect(a.reputation.sent).toBe(9)
  })

  it('propagates the windowDays onto the result for the page subtitle', async () => {
    seedHappyPath()
    const a = await getClinicAnalytics('org_1', 90)
    expect(a.windowDays).toBe(90)
  })
})
