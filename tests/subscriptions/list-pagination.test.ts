import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `listAdminSubscriptions` used to ask Stripe for one page of 100 and stop.
 * Every MRR figure on the platform sums these rows, so the 101st paying
 * clinic would simply not have existed — the same defect class as a board
 * total that reduces over its visible page rather than the whole clinic.
 */

const state = {
  pages: [] as Array<{ data: Array<Record<string, unknown>>; has_more: boolean }>,
  calls: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: {
      list: async (params: Record<string, unknown>) => {
        state.calls.push(params)
        return state.pages.shift() ?? { data: [], has_more: false }
      },
    },
    products: { retrieve: async (id: string) => ({ id, name: 'Premium', deleted: false }) },
  },
  subscriptionPeriodEnd: () => null,
}))
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ leftJoin: () => ({ where: async () => [] }) }) }) },
  schema: new Proxy({}, { get: () => new Proxy({}, { get: (_t, c) => String(c) }) }),
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => ({})), inArray: vi.fn(() => ({})) }))

import { listAdminSubscriptions } from '@/lib/services/stripe-admin'

function stripeSub(id: string) {
  return {
    id,
    status: 'active',
    customer: 'cus_1',
    items: { data: [{ id: `si_${id}`, quantity: 1, price: { id: 'price_1', unit_amount: 20_000, currency: 'usd', recurring: { interval: 'month', interval_count: 1 }, product: 'prod_1' } }] },
    created: 0,
  }
}

function page(ids: string[], hasMore: boolean) {
  return { data: ids.map(stripeSub), has_more: hasMore }
}

beforeEach(() => {
  state.pages = []
  state.calls = []
})

describe('listAdminSubscriptions pagination', () => {
  it('walks every page — the 101st subscription is real revenue', async () => {
    state.pages = [page(['a', 'b'], true), page(['c'], false)]
    const subs = await listAdminSubscriptions()
    expect(subs.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(state.calls).toHaveLength(2)
    // The second request continues from where the first ended.
    expect(state.calls[1].starting_after).toBe('b')
  })

  it('stops when Stripe says there is no more', async () => {
    state.pages = [page(['a'], false), page(['never'], false)]
    const subs = await listAdminSubscriptions()
    expect(subs.map((s) => s.id)).toEqual(['a'])
    expect(state.calls).toHaveLength(1)
  })

  it('an explicit limit still means AT MOST that many', async () => {
    state.pages = [page(['a', 'b', 'c'], true)]
    const subs = await listAdminSubscriptions({ limit: 2 })
    expect(subs.map((s) => s.id)).toEqual(['a', 'b'])
    expect(state.calls).toHaveLength(1)
  })

  it('a page Stripe cannot give a cursor for ends the walk rather than looping', async () => {
    state.pages = [{ data: [], has_more: true }]
    const subs = await listAdminSubscriptions()
    expect(subs).toEqual([])
    expect(state.calls).toHaveLength(1)
  })

  it('never walks unbounded — a has_more that never clears is capped', async () => {
    // Stripe misbehaving must not become an infinite loop against a third party.
    state.pages = Array.from({ length: 40 }, (_, i) => page([`s${i}`], true))
    const subs = await listAdminSubscriptions()
    expect(state.calls.length).toBeLessThanOrEqual(20)
    expect(subs.length).toBe(state.calls.length)
  })

  it('carries seats and interval_count off the price onto the row', async () => {
    const p = page(['a'], false)
    const item = (p.data[0] as { items: { data: Array<Record<string, unknown>> } }).items.data[0]
    item.quantity = 3
    ;(item.price as { recurring: Record<string, unknown> }).recurring.interval_count = 3
    state.pages = [p]
    const [sub] = await listAdminSubscriptions()
    expect(sub.quantity).toBe(3)
    expect(sub.intervalCount).toBe(3)
  })
})
