/**
 * Low-stock classification for the shop restock nudge. productStockState only
 * flags ACTIVE, fully-tracked products; lowStockProducts filters to out/low and
 * orders them out-first, then lowest-remaining first.
 */
import { describe, it, expect } from 'vitest'
import { productStockState, lowStockProducts, LOW_STOCK_THRESHOLD } from '@/lib/types/shop'
import type { ProductRow } from '@/lib/types/shop'

function p(status: string, qtys: Array<number | null>, id = 'x', name = 'X'): ProductRow {
  return {
    id, name, status, variants: qtys.map((q, i) => ({ inventoryQty: q, id: `${id}-${i}` })),
  } as unknown as ProductRow
}

describe('productStockState', () => {
  it('is ok when every variant is above the threshold', () => {
    expect(productStockState(p('active', [10, 8]))).toBe('ok')
    expect(productStockState(p('active', [LOW_STOCK_THRESHOLD + 1]))).toBe('ok')
  })
  it('is out when nothing is buyable', () => {
    expect(productStockState(p('active', [0, 0]))).toBe('out')
  })
  it('is low when any variant is at/below the threshold (but total > 0)', () => {
    expect(productStockState(p('active', [10, 2]))).toBe('low')
    expect(productStockState(p('active', [LOW_STOCK_THRESHOLD]))).toBe('low')
  })
  it('is untracked when a variant has null inventory or there are none', () => {
    expect(productStockState(p('active', [10, null]))).toBe('untracked')
    expect(productStockState(p('active', []))).toBe('untracked')
  })
  it('never flags a non-active product', () => {
    expect(productStockState(p('draft', [0]))).toBe('ok')
    expect(productStockState(p('archived', [0]))).toBe('ok')
  })
})

describe('lowStockProducts', () => {
  it('returns only out/low products, out-first then lowest-remaining first', () => {
    const products = [
      p('active', [50], 'fine', 'Fine'), // ok — excluded
      p('active', [10, 3], 'low3', 'Low3'), // low, lowest 3
      p('active', [0, 0], 'out', 'Out'), // out
      p('active', [2], 'low2', 'Low2'), // low, lowest 2
      p('active', [7, null], 'untracked', 'Untracked'), // untracked — excluded
      p('draft', [0], 'draft', 'Draft'), // non-active — excluded
    ]
    const rows = lowStockProducts(products)
    expect(rows.map((r) => r.product.id)).toEqual(['out', 'low2', 'low3'])
    expect(rows[0].state).toBe('out')
    expect(rows[1]).toMatchObject({ state: 'low', lowestQty: 2 })
    expect(rows[2]).toMatchObject({ state: 'low', lowestQty: 3 })
  })

  it('is empty when nothing is low or out', () => {
    expect(lowStockProducts([p('active', [99]), p('active', [10, null])])).toEqual([])
  })
})
