import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatCents, priceRangeLabel } from '@/lib/types/shop'

const state: { selectQueue: unknown[][]; inserts: Array<{ table: string; values: unknown }> } = {
  selectQueue: [],
  inserts: [],
}

vi.mock('@/lib/db', () => {
  const tableName = (t: any) => (t && t[Symbol.for('drizzle:Name')]) || 'unknown'
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.groupBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (t: unknown) => ({
        values: (vals: unknown) => {
          state.inserts.push({ table: tableName(t), values: vals })
          return { onConflictDoNothing: () => Promise.resolve(), then: (r: (v: unknown) => void) => r(undefined) }
        },
      }),
      update: () => ({ set: () => ({ where: async () => {} }) }),
      delete: () => ({ where: async () => {} }),
    },
    schema: new Proxy({}, { get: (_t, prop) => ({ [Symbol.for('drizzle:Name')]: String(prop).replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`) }) }),
  }
})

import { getShopConfig, saveProduct } from '@/lib/services/shop'

beforeEach(() => {
  state.selectQueue.length = 0
  state.inserts.length = 0
})

describe('formatCents / priceRangeLabel', () => {
  it('formats money and price ranges', () => {
    expect(formatCents(14900)).toBe('$149.00')
    expect(formatCents(2900)).toBe('$29.00')
    expect(priceRangeLabel({ minPriceCents: 14900, maxPriceCents: 14900 })).toBe('$149.00')
    expect(priceRangeLabel({ minPriceCents: 1200, maxPriceCents: 2400 })).toBe('$12.00–$24.00')
  })
})

describe('getShopConfig', () => {
  it('returns sensible defaults when no row exists', async () => {
    state.selectQueue.push([]) // no config row
    const cfg = await getShopConfig('org_1')
    expect(cfg.pickupEnabled).toBe(true)
    expect(cfg.shippingEnabled).toBe(false)
    expect(cfg.stripeAccountStatus).toBe('none')
    expect(cfg.currency).toBe('usd')
  })
})

describe('saveProduct', () => {
  it('creates a product, converts dollars to cents, and disambiguates slug collisions', async () => {
    state.selectQueue.push([{ slug: 'whitening-kit', id: 'other' }]) // uniqueProductSlug existing
    await saveProduct('org_1', {
      name: 'Whitening Kit',
      category: 'whitening',
      images: [],
      fulfillment: 'both',
      status: 'active',
      fsaEligible: false,
      featured: true,
      variants: [
        { name: 'Standard', priceDollars: 149, inventoryQty: 10 },
        { name: 'Sensitive', priceDollars: 149.5, inventoryQty: null },
      ],
    })
    const product = state.inserts.find((i) => i.table === 'shop_product')!.values as { slug: string; featured: number }
    expect(product.slug).toBe('whitening-kit-2')
    expect(product.featured).toBe(1)
    const variants = state.inserts.find((i) => i.table === 'shop_product_variant')!.values as Array<{ priceCents: number; inventoryQty: number | null }>
    expect(variants).toHaveLength(2)
    expect(variants[0].priceCents).toBe(14900)
    expect(variants[1].priceCents).toBe(14950)
    expect(variants[1].inventoryQty).toBeNull()
  })

  it('injects a Default variant when none are provided', async () => {
    state.selectQueue.push([]) // no existing slugs
    await saveProduct('org_1', {
      name: 'Floss Picks',
      category: 'flossers',
      images: [],
      fulfillment: 'pickup',
      status: 'draft',
      fsaEligible: false,
      featured: false,
      variants: [],
    })
    const variants = state.inserts.find((i) => i.table === 'shop_product_variant')!.values as Array<{ name: string }>
    expect(variants).toHaveLength(1)
    expect(variants[0].name).toBe('Default')
  })
})
