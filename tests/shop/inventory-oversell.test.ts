import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * applyInventoryForPaidOrder decrements tracked inventory at finalize. A FOR
 * UPDATE row lock serializes concurrent finalizes for the same variant so an
 * oversell is DETECTED (and the variant clamped to 0 + reported), instead of
 * the old greatest(qty-n,0) silently flooring it. Untracked variants (null)
 * are unlimited and skipped.
 */

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<{ set: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ for: () => ({ limit: async () => state.selectQueue.shift() ?? [] }) }),
      }),
    }),
    update: () => ({ set: (s: Record<string, unknown>) => ({ where: async () => { state.updates.push({ set: s }) } }) }),
  }
  return {
    db: { transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx) },
    schema: new Proxy({}, { get: () => ({}) }),
  }
})
vi.mock('@/lib/stripe', () => ({ stripe: {}, subscriptionPeriodEnd: () => null }))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  ne: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}))

import { applyInventoryForPaidOrder } from '@/lib/services/shop-checkout'

beforeEach(() => {
  state.selectQueue.length = 0
  state.updates.length = 0
})

describe('applyInventoryForPaidOrder', () => {
  it('decrements a tracked variant with enough stock', async () => {
    state.selectQueue.push([{ qty: 10 }])
    const over = await applyInventoryForPaidOrder('org_1', [{ variantId: 'v1', quantity: 3, productName: 'Kit' }])
    expect(over).toEqual([])
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].set.inventoryQty).toBe(7)
  })

  it('detects an oversell, clamps to 0, and reports it', async () => {
    state.selectQueue.push([{ qty: 2 }])
    const over = await applyInventoryForPaidOrder('org_1', [{ variantId: 'v1', quantity: 5, productName: 'Brush' }])
    expect(over).toEqual([{ name: 'Brush', ordered: 5, had: 2 }])
    expect(state.updates[0].set.inventoryQty).toBe(0) // clamped, not floored silently
  })

  it('skips an untracked variant (inventoryQty null = unlimited)', async () => {
    state.selectQueue.push([{ qty: null }])
    const over = await applyInventoryForPaidOrder('org_1', [{ variantId: 'v1', quantity: 99, productName: 'X' }])
    expect(over).toEqual([])
    expect(state.updates).toHaveLength(0)
  })

  it('skips items with no variant id', async () => {
    const over = await applyInventoryForPaidOrder('org_1', [{ variantId: null, quantity: 1, productName: 'Free' }])
    expect(over).toEqual([])
    expect(state.updates).toHaveLength(0)
  })

  it('handles a mix across items in order', async () => {
    state.selectQueue.push([{ qty: 10 }], [{ qty: 1 }]) // v1 ok, v2 oversold
    const over = await applyInventoryForPaidOrder('org_1', [
      { variantId: 'v1', quantity: 4, productName: 'Kit' },
      { variantId: null, quantity: 2, productName: 'Free' }, // skipped, no select consumed
      { variantId: 'v2', quantity: 3, productName: 'Brush' },
    ])
    expect(over).toEqual([{ name: 'Brush', ordered: 3, had: 1 }])
    expect(state.updates.map((u) => u.set.inventoryQty)).toEqual([6, 0])
  })
})
