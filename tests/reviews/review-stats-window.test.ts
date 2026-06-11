import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * getReviewStats windowDays threading.
 *
 * The Analytics page has a 30/90-day range toggle. Before this fix
 * getReviewStats hardcoded a 30-day floor and ignored the toggle, so the
 * Reputation band silently showed 30-day data under the 90-day view. These
 * tests prove the date floor for the sent/clicked/completed aggregates moves
 * with windowDays, and that the result echoes windowDays + a measured
 * clicked count (clicked30d) rather than anything reconstructed from a rate.
 */

// Every gte(column, value) call records its Date argument so we can assert
// the window floor. The review-stats queries pass the window floor as the
// gte value (sentAt/clickedAt/completedAt >= since).
const gteDates: Date[] = []

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  gte: vi.fn((_col: unknown, value: unknown) => {
    if (value instanceof Date) gteDates.push(value)
    return { _: 'gte' }
  }),
  lte: vi.fn(() => ({ _: 'lte' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  desc: vi.fn((x) => x),
  count: vi.fn(() => ({ _: 'count' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

// db chain resolves all aggregate reads to a fixed count, and the eligible-
// patients sub-queries (appointment/patient/reviewRequest) to empty arrays.
// getReviewStats only cares about the .then()/.groupBy() resolution + the
// gte() args (captured above), so a permissive chain is enough.
vi.mock('@/lib/db', () => {
  const makeChain = () => {
    const c: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy', 'limit']) {
      c[m] = () => c
    }
    // Aggregate count() reads resolve via .then(); they want [{ c: N }].
    c.then = (resolve: (v: unknown) => void) => resolve([{ c: 3 }])
    return c
  }
  return {
    db: { select: () => makeChain() },
    schema: new Proxy({}, { get: () => new Proxy({}, { get: () => ({}) }) }),
  }
})

// Mock the config read so listEligiblePatients (called internally) produces
// VALID dates — otherwise minDaysBetweenRequests=undefined yields an
// Invalid Date in the rate-limit floor and pollutes the capture.
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({ from: 'x', replyTo: null, name: 'Acme' })),
}))
vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: async () => ({ id: 'mock' }) } } }))

import { getReviewStats } from '@/lib/services/reviews'

const NOW = new Date('2026-06-11T12:00:00Z').getTime()
const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  gteDates.length = 0
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

/** Captured gte() Date args, valid only, as epoch ms. */
function validFloors(): number[] {
  return gteDates.map((d) => d.getTime()).filter((t) => !Number.isNaN(t))
}

describe('getReviewStats — windowDays', () => {
  it('defaults to a 30-day floor when no window is passed (back-compat)', async () => {
    const stats = await getReviewStats('org_1')
    expect(stats.windowDays).toBe(30)
    // The window floor (now − 30d) is among the captured gte() args.
    expect(validFloors()).toContain(NOW - 30 * DAY)
    // …and a 90-day floor is NOT (we didn't widen the window).
    expect(validFloors()).not.toContain(NOW - 90 * DAY)
  })

  it('30 vs 90 produce different scoped date floors', async () => {
    await getReviewStats('org_1', 30)
    const floors30 = validFloors()
    expect(floors30).toContain(NOW - 30 * DAY)
    expect(floors30).not.toContain(NOW - 90 * DAY)

    gteDates.length = 0
    const stats90 = await getReviewStats('org_1', 90)
    expect(stats90.windowDays).toBe(90)
    const floors90 = validFloors()
    // The window queries now floor at 90 days, not 30.
    expect(floors90).toContain(NOW - 90 * DAY)
  })

  it('reports a measured clicked count (clicked30d) alongside the click rate', async () => {
    // The mock resolves every count() read to 3, so sent=clicked=completed=3.
    const stats = await getReviewStats('org_1', 30)
    expect(stats.clicked30d).toBe(3) // a real count, not round(sent * rate)
    expect(stats.sent30d).toBe(3)
    expect(stats.clickRate30d).toBe(100) // 3/3
  })
})
