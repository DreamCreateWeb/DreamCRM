import { describe, it, expect, vi, beforeEach } from 'vitest'
import { intervalSuffix } from '@/lib/types/membership'

const state: {
  selectQueue: unknown[][]
  inserts: Array<{ table: string; values: unknown }>
  updates: Array<Record<string, unknown>>
} = { selectQueue: [], inserts: [], updates: [] }

vi.mock('@/lib/db', () => {
  const tableName = (t: any) => (t && t[Symbol.for('drizzle:Name')]) || 'unknown'
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
      insert: (t: unknown) => ({
        values: (vals: unknown) => {
          state.inserts.push({ table: tableName(t), values: vals })
          return { onConflictDoNothing: () => Promise.resolve(), then: (r: (v: unknown) => void) => r(undefined) }
        },
      }),
      update: () => ({ set: (s: Record<string, unknown>) => ({ where: async () => { state.updates.push(s) } }) }),
    },
    schema: new Proxy({}, { get: (_t, prop) => ({ [Symbol.for('drizzle:Name')]: String(prop).replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`) }) }),
  }
})
vi.mock('@/lib/stripe', () => ({ stripe: {} }))

import { savePlan, getMembershipStats, handleSubscriptionEvent } from '@/lib/services/membership'

beforeEach(() => {
  state.selectQueue.length = 0
  state.inserts.length = 0
  state.updates.length = 0
})

describe('intervalSuffix', () => {
  it('maps billing interval to a price suffix', () => {
    expect(intervalSuffix('annual')).toBe('/yr')
    expect(intervalSuffix('monthly')).toBe('/mo')
  })
})

describe('savePlan', () => {
  it('creates a plan, converts price to cents, clamps discount, and drops blank benefits', async () => {
    state.selectQueue.push([]) // uniquePlanSlug — no existing
    await savePlan('org_1', {
      name: 'Smile Club',
      description: 'No insurance? No problem.',
      billingInterval: 'annual',
      priceDollars: 399,
      discountPercent: 150,
      status: 'active',
      featured: true,
      benefits: [{ label: '2 cleanings', qty: 2 }, { label: '', qty: 1 }],
    })
    const plan = state.inserts.find((i) => i.table === 'membership_plan')!.values as {
      slug: string
      priceCents: number
      discountPercent: number
      benefits: unknown[]
    }
    expect(plan.slug).toBe('smile-club')
    expect(plan.priceCents).toBe(39900)
    expect(plan.discountPercent).toBe(100) // clamped
    expect(plan.benefits).toHaveLength(1) // blank dropped
  })
})

describe('getMembershipStats', () => {
  it('normalizes annual plans to monthly for MRR', async () => {
    state.selectQueue.push([
      { priceCents: 39900, interval: 'annual' }, // 3325/mo
      { priceCents: 3900, interval: 'monthly' }, // 3900/mo
    ])
    const stats = await getMembershipStats('org_1')
    expect(stats.activeMembers).toBe(2)
    expect(stats.mrrCents).toBe(Math.round(39900 / 12) + 3900)
  })
})

describe('handleSubscriptionEvent', () => {
  it('maps Stripe subscription statuses to membership statuses', async () => {
    await handleSubscriptionEvent('org_1', 'sub_1', 'past_due', null)
    expect((state.updates[0] as { status: string }).status).toBe('past_due')
    await handleSubscriptionEvent('org_1', 'sub_1', 'canceled', null)
    expect((state.updates[1] as { status: string }).status).toBe('cancelled')
    await handleSubscriptionEvent('org_1', 'sub_1', 'active', 1800000000)
    expect((state.updates[2] as { status: string }).status).toBe('active')
  })
})
