import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { selectQueue: unknown[][] } = { selectQueue: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.leftJoin = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return { db: { select: () => chain() }, schema: new Proxy({}, { get: () => ({}) }) }
})

import { validateCoupon } from '@/lib/services/coupons'

function coupon(over: Record<string, unknown> = {}) {
  return {
    id: 'coupon_1',
    code: 'SAVE',
    discountType: 'percent',
    discountValue: 10,
    active: 1,
    singleUse: 0,
    minSubtotalCents: null,
    expiresAt: null,
    usedAt: null,
    ...over,
  }
}

beforeEach(() => {
  state.selectQueue.length = 0
})

describe('validateCoupon', () => {
  it('computes a percent discount', async () => {
    state.selectQueue.push([coupon({ discountType: 'percent', discountValue: 10 })])
    const v = await validateCoupon('org_1', 'SAVE', 10000)
    expect(v.ok).toBe(true)
    expect(v.discountCents).toBe(1000)
  })

  it('computes an amount discount, capped at the subtotal', async () => {
    state.selectQueue.push([coupon({ discountType: 'amount', discountValue: 2500 })])
    expect((await validateCoupon('org_1', 'SAVE', 10000)).discountCents).toBe(2500)
    state.selectQueue.push([coupon({ discountType: 'amount', discountValue: 9999 })])
    expect((await validateCoupon('org_1', 'SAVE', 5000)).discountCents).toBe(5000) // capped
  })

  it('rejects unknown / inactive codes', async () => {
    state.selectQueue.push([])
    expect((await validateCoupon('org_1', 'NOPE', 10000)).ok).toBe(false)
    state.selectQueue.push([coupon({ active: 0 })])
    expect((await validateCoupon('org_1', 'SAVE', 10000)).ok).toBe(false)
  })

  it('rejects expired and already-used single-use codes', async () => {
    state.selectQueue.push([coupon({ expiresAt: new Date(Date.now() - 1000) })])
    expect((await validateCoupon('org_1', 'SAVE', 10000)).ok).toBe(false)
    state.selectQueue.push([coupon({ singleUse: 1, usedAt: new Date() })])
    expect((await validateCoupon('org_1', 'SAVE', 10000)).ok).toBe(false)
  })

  it('enforces a minimum subtotal', async () => {
    state.selectQueue.push([coupon({ minSubtotalCents: 10000 })])
    const v = await validateCoupon('org_1', 'SAVE', 5000)
    expect(v.ok).toBe(false)
    expect(v.error).toMatch(/Minimum/)
  })
})
