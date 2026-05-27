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

vi.mock('@/lib/services/reviews', () => ({
  getReviewStats: vi.fn(async () => ({
    sent30d: 10,
    completed30d: 4,
    clickRate30d: 50,
    completionRate30d: 40,
    eligibleCount: 5,
    byPlatform: { google: 3, healthgrades: 1, facebook: 0, yelp: 0 },
    pending: 2,
  })),
}))
vi.mock('@/lib/services/patients', () => ({
  listPatients: vi.fn(async () => [{ recallStatus: 'due' }, { recallStatus: 'overdue' }, { recallStatus: 'na' }]),
}))
vi.mock('@/lib/services/gsc', () => ({
  getGscPerformance: vi.fn(async () => ({ clicks: 120, impressions: 0, ctr: 0, position: 0, topQueries: [] })),
}))

import { getClinicAnalytics, weeklyTrend } from '@/lib/services/analytics'

beforeEach(() => {
  q.queue.length = 0
})

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
    q.queue.push([{ c: 1 }]) // 2. prevNewPatients
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
  })
})
