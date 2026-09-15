import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * getOrderStats — the Shop hub's revenue tile and its trailing-30-day figure,
 * NET of refunds (DREAMCRM-32).
 *
 * A FULLY refunded shop order flips to `status = 'refunded'` and leaves the
 * 'paid' set on its own, so it was already excluded. The case the status
 * column cannot express is the PARTIAL refund: the order stays 'paid' at full
 * face value, and this tile counted every cent of it as money the clinic kept.
 */

const state: { rows: Record<string, unknown>[] } = { rows: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const o: Record<string, unknown> = {}
    for (const m of ['from', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy']) o[m] = () => o
    o.where = () => o
    o.limit = async () => state.rows
    o.then = (resolve: (v: unknown) => void) => resolve(state.rows)
    return o
  }
  return { db: { select: () => chain() }, schema: new Proxy({}, { get: () => ({}) }) }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
  count: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  ilike: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  sql: Object.assign((..._a: unknown[]) => ({}), { raw: () => ({}) }),
}))
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))

import { getOrderStats } from '@/lib/services/shop'

const recently = () => new Date(Date.now() - 2 * 24 * 3_600_000)

beforeEach(() => {
  state.rows = []
})

describe('getOrderStats nets Stripe refunds out of revenue', () => {
  it('counts an unrefunded paid order at face value', async () => {
    state.rows = [
      {
        status: 'paid',
        fulfillmentStatus: 'picked_up',
        totalCents: 14_900,
        refundedAmountCents: 0,
        createdAt: recently(),
      },
    ]
    const stats = await getOrderStats('org_1')
    expect(stats.paidCount).toBe(1)
    expect(stats.revenueCents).toBe(14_900)
    expect(stats.last30Cents).toBe(14_900)
  })

  it('subtracts a PARTIAL refund the status column cannot express', async () => {
    state.rows = [
      {
        status: 'paid',
        fulfillmentStatus: 'picked_up',
        totalCents: 14_900,
        refundedAmountCents: 5_000,
        createdAt: recently(),
      },
    ]
    const stats = await getOrderStats('org_1')
    // Still a paid order the clinic fulfilled — but $50 of it went back.
    expect(stats.paidCount).toBe(1)
    expect(stats.revenueCents).toBe(9_900)
    expect(stats.last30Cents).toBe(9_900)
  })

  it('reaches zero revenue when everything came back, without losing the order', async () => {
    state.rows = [
      {
        status: 'paid',
        fulfillmentStatus: 'picked_up',
        totalCents: 14_900,
        refundedAmountCents: 14_900,
        createdAt: recently(),
      },
    ]
    const stats = await getOrderStats('org_1')
    expect(stats.paidCount).toBe(1)
    expect(stats.revenueCents).toBe(0)
  })

  it('never lets a refund drag revenue below zero', async () => {
    state.rows = [
      {
        status: 'paid',
        fulfillmentStatus: 'picked_up',
        totalCents: 5_000,
        refundedAmountCents: 9_000,
        createdAt: recently(),
      },
      {
        status: 'paid',
        fulfillmentStatus: 'picked_up',
        totalCents: 2_000,
        refundedAmountCents: 0,
        createdAt: recently(),
      },
    ]
    const stats = await getOrderStats('org_1')
    // The clamp is per charge, so one impossible row cannot eat the other's
    // real revenue.
    expect(stats.revenueCents).toBe(2_000)
  })

  it('leaves a pending order out entirely — netting never promotes it', async () => {
    state.rows = [
      {
        status: 'pending',
        fulfillmentStatus: 'unfulfilled',
        totalCents: 14_900,
        refundedAmountCents: 0,
        createdAt: recently(),
      },
    ]
    const stats = await getOrderStats('org_1')
    expect(stats.paidCount).toBe(0)
    expect(stats.revenueCents).toBe(0)
  })
})
