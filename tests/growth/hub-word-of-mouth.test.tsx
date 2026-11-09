import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * WORD OF MOUTH on the Growth hub (ML-39): counts distinct PEOPLE from the
 * patient record's own referral columns, this clinic-local month against the
 * same point last month; backfills and archived/merged out; honest at zero.
 */

const rows = vi.hoisted(() => ({ list: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/db', () => {
  const schema = new Proxy({}, {
    get: (_t, table: string) => new Proxy({ __name: table }, { get: (o, c: string) => (c in o ? (o as Record<string, unknown>)[c] : { __col: c }) }),
  })
  const select = () => {
    const api: Record<string, unknown> = {}
    api.from = () => api
    api.where = () => api
    api.then = (res: (v: unknown[]) => unknown) => Promise.resolve(rows.list).then(res)
    return api
  }
  return { db: { select }, schema }
})
vi.mock('drizzle-orm', () => ({
  and: () => true, eq: () => true, gte: () => true, lt: () => true, ne: () => true, or: () => true, isNull: () => true, isNotNull: () => true,
}))

import { getWordOfMouthCounts, wordOfMouthLine } from '@/lib/services/growth-hub'

const TZ = 'America/Chicago'
const NOW = new Date('2026-11-16T15:00:00Z') // Nov 16, 9am Central
const p = (id: string, iso: string, over: Record<string, unknown> = {}) => ({
  id, source: 'referral', referredBy: null, firstSeenAt: new Date(iso), ...over,
})

beforeEach(() => {
  rows.list = []
})

describe('getWordOfMouthCounts', () => {
  it('counts distinct people this month vs the same point last month, and the referrers', async () => {
    rows.list = [
      p('a', '2026-11-03T16:00:00Z', { source: 'booking', referredBy: 'r1' }),
      p('b', '2026-11-10T16:00:00Z', { referredBy: 'r1' }),
      p('c', '2026-11-12T16:00:00Z'), // source = referral, no link
      p('d', '2026-10-05T16:00:00Z'), // last month, before the same point
      p('e', '2026-10-28T16:00:00Z'), // last month, AFTER the same point -> not counted
    ]
    expect(await getWordOfMouthCounts('org_1', TZ, NOW)).toEqual({
      thisMonth: 3, lastMonthSamePoint: 1, referrersThisMonth: 1,
    })
  })
  it('a bulk backfill never fakes a win; the same person twice is one', async () => {
    rows.list = [
      p('a', '2026-11-03T16:00:00Z', { source: 'import', referredBy: 'r1' }),
      p('b', '2026-11-04T16:00:00Z'),
      p('b', '2026-11-04T16:00:00Z', { referredBy: 'r2' }),
    ]
    expect((await getWordOfMouthCounts('org_1', TZ, NOW)).thisMonth).toBe(1)
  })
  it('the month boundary is the clinic’s (Oct 31 9pm Central is already Nov in UTC)', async () => {
    rows.list = [p('a', '2026-11-01T02:00:00Z')]
    expect(await getWordOfMouthCounts('org_1', TZ, NOW)).toMatchObject({ thisMonth: 0 })
  })
})

describe('wordOfMouthLine', () => {
  it('is honest at zero and never invents a trend', () => {
    expect(wordOfMouthLine({ thisMonth: 0, lastMonthSamePoint: 0, referrersThisMonth: 0 })).toMatch(/no new patients through a friend yet/)
  })
  it('names the month and the comparison', () => {
    expect(wordOfMouthLine({ thisMonth: 1, lastMonthSamePoint: 2, referrersThisMonth: 1 })).toBe(
      '1 new patient through a friend this month · 2 at this point last month',
    )
  })
})
