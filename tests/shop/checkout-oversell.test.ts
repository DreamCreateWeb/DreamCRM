import { describe, it, expect, vi, beforeEach } from 'vitest'

// selectQueue drives each db.select(): connectedAccount shifts the config row,
// then priceCart shifts the variant rows. The oversell guard throws right after
// priceCart, before any Stripe call, so we never need a real Stripe mock.
const state: { selectQueue: unknown[][] } = { selectQueue: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    for (const m of ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy']) obj[m] = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({ values: async () => {} }),
      update: () => ({ set: () => ({ where: async () => {} }) }),
    },
    schema: new Proxy({}, { get: () => ({}) }),
  }
})
vi.mock('@/lib/stripe', () => ({ stripe: {}, subscriptionPeriodEnd: () => null }))

import { createShopCheckoutSession } from '@/lib/services/shop-checkout'

const ACTIVE_CONFIG = {
  accountId: 'acct_1',
  status: 'active',
  charges: 1,
  shippingEnabled: 0,
  pickupEnabled: 1,
  flatShippingCents: 0,
  freeShippingThresholdCents: null,
  taxEnabled: 0,
  platformFeeBps: 0,
  currency: 'usd',
}

function variantRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    variantId: 'v1',
    priceCents: 1000,
    variantName: 'Default',
    inventoryQty: 2,
    productId: 'p1',
    productName: 'Whitening Kit',
    productSlug: 'whitening-kit',
    status: 'active',
    ...over,
  }
}

beforeEach(() => {
  state.selectQueue.length = 0
})

describe('createShopCheckoutSession oversell guard', () => {
  it('rejects when the requested quantity exceeds tracked stock', async () => {
    state.selectQueue.push([ACTIVE_CONFIG], [variantRow({ inventoryQty: 2 })])
    await expect(
      createShopCheckoutSession('org_1', 'https://x', {
        items: [{ variantId: 'v1', qty: 5 }],
        fulfillmentType: 'pickup',
        email: 'a@x.com',
      }),
    ).rejects.toThrow(/Only 2 of Whitening Kit/i)
  })

  it('reports "out of stock" when the tracked stock is zero', async () => {
    state.selectQueue.push([ACTIVE_CONFIG], [variantRow({ inventoryQty: 0 })])
    await expect(
      createShopCheckoutSession('org_1', 'https://x', {
        items: [{ variantId: 'v1', qty: 1 }],
        fulfillmentType: 'pickup',
        email: 'a@x.com',
      }),
    ).rejects.toThrow(/out of stock/i)
  })

  it('does not block an untracked variant (inventoryQty null)', async () => {
    // Untracked = unlimited. The oversell guard must pass; the call then fails
    // later for an unrelated reason (the empty Stripe mock), proving the guard
    // itself didn't reject.
    state.selectQueue.push([ACTIVE_CONFIG], [variantRow({ inventoryQty: null })])
    await expect(
      createShopCheckoutSession('org_1', 'https://x', {
        items: [{ variantId: 'v1', qty: 99 }],
        fulfillmentType: 'pickup',
        email: 'a@x.com',
      }),
    ).rejects.not.toThrow(/stock|left/i)
  })
})
