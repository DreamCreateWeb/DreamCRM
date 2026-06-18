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

import {
  savePlan,
  getMembershipStats,
  handleSubscriptionEvent,
  createMembershipCheckout,
  markBenefitUsed,
} from '@/lib/services/membership'

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

  it('only stamps cancelledAt on a cancel event and never clears it on later events', async () => {
    await handleSubscriptionEvent('org_1', 'sub_1', 'canceled', null)
    expect((state.updates[0] as { cancelledAt?: unknown }).cancelledAt).toBeInstanceOf(Date)

    // A later recovery/update must NOT carry a cancelledAt key at all, so the
    // existing timestamp is preserved (Stripe retries + reorders events).
    await handleSubscriptionEvent('org_1', 'sub_1', 'active', 1800000000)
    expect('cancelledAt' in (state.updates[1] as object)).toBe(false)
    expect((state.updates[1] as { currentPeriodEnd?: unknown }).currentPeriodEnd).toBeInstanceOf(Date)

    // currentPeriodEnd is omitted (not nulled) when the event doesn't carry one.
    await handleSubscriptionEvent('org_1', 'sub_1', 'past_due', null)
    expect('currentPeriodEnd' in (state.updates[2] as object)).toBe(false)
  })
})

describe('createMembershipCheckout — duplicate-subscription guard', () => {
  const input = { planSlug: 'p', email: 'a@b.com', firstName: 'A', lastName: 'B', phone: null }
  // The fixed select order before the guard: connect account, plan, email match.
  function queueUpToGuard() {
    state.selectQueue.push([{ accountId: 'acct_1', status: 'active', charges: 1 }]) // connectedAccountId
    state.selectQueue.push([{ id: 'plan_1', stripePriceId: 'price_1' }]) // plan (priceId set → no stripe)
    state.selectQueue.push([{ id: 'pat_1' }]) // patient email match
  }

  it('refuses a second subscription when an active membership exists', async () => {
    queueUpToGuard()
    state.selectQueue.push([{ status: 'active', createdAt: new Date() }]) // existing memberships
    await expect(createMembershipCheckout('org_1', 'http://x', input)).rejects.toThrow(/already a member/i)
    expect(state.inserts.find((i) => i.table === 'membership')).toBeUndefined()
  })

  it('refuses when a recent pending checkout is in flight (double-submit)', async () => {
    queueUpToGuard()
    state.selectQueue.push([{ status: 'pending', createdAt: new Date() }])
    await expect(createMembershipCheckout('org_1', 'http://x', input)).rejects.toThrow(/in progress/i)
    expect(state.inserts.find((i) => i.table === 'membership')).toBeUndefined()
  })

  it('allows a re-join when the only prior membership is an OLD (abandoned) pending', async () => {
    queueUpToGuard()
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    state.selectQueue.push([{ status: 'pending', createdAt: twoHoursAgo }])
    // Not blocked → it gets PAST the guard and inserts the membership (then the
    // stub Stripe client throws on session creation — which is fine, we only
    // assert the guard let it through).
    await expect(createMembershipCheckout('org_1', 'http://x', input)).rejects.toThrow()
    expect(state.inserts.find((i) => i.table === 'membership')).toBeDefined()
  })

  it('allows a re-join when the prior membership was cancelled', async () => {
    queueUpToGuard()
    state.selectQueue.push([{ status: 'cancelled', createdAt: new Date() }])
    await expect(createMembershipCheckout('org_1', 'http://x', input)).rejects.toThrow()
    expect(state.inserts.find((i) => i.table === 'membership')).toBeDefined()
  })
})

describe('markBenefitUsed — allotment cap', () => {
  it('increments usage below the cap', async () => {
    state.selectQueue.push([{ benefitsUsed: {}, benefits: [{ label: 'Cleaning', qty: 2 }] }])
    await markBenefitUsed('org_1', 'mem_1', 'Cleaning')
    expect((state.updates[0] as { benefitsUsed: Record<string, number> }).benefitsUsed.Cleaning).toBe(1)
  })

  it('refuses to redeem past the plan allotment', async () => {
    state.selectQueue.push([{ benefitsUsed: { Cleaning: 2 }, benefits: [{ label: 'Cleaning', qty: 2 }] }])
    await expect(markBenefitUsed('org_1', 'mem_1', 'Cleaning')).rejects.toThrow(/fully used/i)
    expect(state.updates).toHaveLength(0)
  })

  it('treats a benefit with no qty as unlimited', async () => {
    state.selectQueue.push([{ benefitsUsed: { Whitening: 9 }, benefits: [{ label: 'Whitening' }] }])
    await markBenefitUsed('org_1', 'mem_1', 'Whitening')
    expect((state.updates[0] as { benefitsUsed: Record<string, number> }).benefitsUsed.Whitening).toBe(10)
  })
})
