import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE recurring-revenue number, and the two things that made it wrong.
 *
 * 1. `monthlyContributionCents` read only `unit_amount` + `interval`. Seats
 *    (`quantity`) were dropped, so a 3-seat subscription counted once; and
 *    `interval_count: 3` — a QUARTERLY price — counted as if it billed every
 *    month, overstating that clinic threefold.
 *
 * 2. `TIER_PRICES_CENTS` existed in THREE copies that disagreed:
 *    clinics.ts and projects.ts said {basic 9900, pro 14900, premium 19900};
 *    platform-metrics.ts said {basic 15000, pro 25000, premium 20000}, with
 *    premium priced BELOW pro. Two dashboards therefore computed different
 *    MRR from the same tenants, and neither matched anyone's invoice.
 *
 * The constant is gone. The money comes from Stripe; only who-counts comes
 * from our database.
 */

const state = {
  clinics: [] as unknown[],
  clinicsThrow: null as Error | null,
  subs: [] as unknown[],
  subsThrow: null as Error | null,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => {
      if (state.clinicsThrow) throw state.clinicsThrow
      return Promise.resolve(state.clinics)
    }
    return obj
  }
  return { db: { select: () => chain() } }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
}))
vi.mock('@/lib/db/schema/auth', () => ({ organization: { id: 'id', isDemo: 'isDemo' } }))
vi.mock('@/lib/db/schema/platform', () => ({
  clinicProfile: {
    organizationId: 'organizationId',
    planTier: 'planTier',
    subscriptionStatus: 'subscriptionStatus',
    stripeSubscriptionId: 'stripeSubscriptionId',
  },
}))
vi.mock('@/lib/services/stripe-admin', async () => {
  const { normalizedMonthlyCents } = await import('@/lib/mrr')
  return {
    listAdminSubscriptions: async () => {
      if (state.subsThrow) throw state.subsThrow
      return state.subs
    },
    // The real gate + the real math, so this test exercises the actual rules.
    monthlyContributionCents: (sub: { status: string }) =>
      sub.status !== 'active' && sub.status !== 'trialing'
        ? 0
        : normalizedMonthlyCents(sub as never),
  }
})

import { getPlatformMrr } from '@/lib/services/platform-mrr'
import { normalizedMonthlyCents } from '@/lib/mrr'

function clinic(over: Record<string, unknown> = {}) {
  return {
    orgId: 'org_1',
    planTier: 'premium',
    subscriptionStatus: 'active',
    stripeSubscriptionId: 'sub_1',
    ...over,
  }
}

function sub(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    status: 'active',
    unitAmountCents: 20_000,
    interval: 'month',
    intervalCount: 1,
    quantity: 1,
    ...over,
  }
}

const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

beforeEach(() => {
  state.clinics = []
  state.clinicsThrow = null
  state.subs = []
  state.subsThrow = null
  warn.mockClear()
})

describe('normalizedMonthlyCents — the cadence and seat math', () => {
  it('a monthly price is itself', () => {
    expect(normalizedMonthlyCents({ unitAmountCents: 20_000, interval: 'month' })).toBe(20_000)
  })

  it('SEATS multiply — a 3-seat subscription bills three times the unit amount', () => {
    expect(
      normalizedMonthlyCents({ unitAmountCents: 20_000, interval: 'month', quantity: 3 }),
    ).toBe(60_000)
  })

  it('QUARTERLY is not monthly — interval_count 3 divides by 3', () => {
    // The defect this replaced counted $600 every 3 months as $600/month.
    expect(
      normalizedMonthlyCents({ unitAmountCents: 60_000, interval: 'month', intervalCount: 3 }),
    ).toBe(20_000)
  })

  it('annual spreads over twelve months', () => {
    expect(normalizedMonthlyCents({ unitAmountCents: 240_000, interval: 'year' })).toBe(20_000)
  })

  it('a two-year price spreads over twenty-four', () => {
    expect(
      normalizedMonthlyCents({ unitAmountCents: 480_000, interval: 'year', intervalCount: 2 }),
    ).toBe(20_000)
  })

  it('weekly and daily scale up', () => {
    expect(normalizedMonthlyCents({ unitAmountCents: 5_000, interval: 'week' })).toBe(20_000)
    expect(normalizedMonthlyCents({ unitAmountCents: 100, interval: 'day' })).toBe(3_000)
  })

  it('seats and cadence compose', () => {
    // 4 seats at $150, billed quarterly → $600/quarter → $200/month.
    expect(
      normalizedMonthlyCents({
        unitAmountCents: 15_000,
        interval: 'month',
        intervalCount: 3,
        quantity: 4,
      }),
    ).toBe(20_000)
  })

  it('a missing amount contributes nothing', () => {
    expect(normalizedMonthlyCents({ unitAmountCents: null, interval: 'month' })).toBe(0)
  })

  it('nonsense from Stripe never divides by zero or zeroes a real charge', () => {
    expect(
      normalizedMonthlyCents({ unitAmountCents: 20_000, interval: 'month', intervalCount: 0 }),
    ).toBe(20_000)
    expect(
      normalizedMonthlyCents({ unitAmountCents: 20_000, interval: 'month', quantity: 0 }),
    ).toBe(20_000)
    // An interval we do not know falls back to monthly rather than vanishing.
    expect(normalizedMonthlyCents({ unitAmountCents: 20_000, interval: 'fortnight' })).toBe(20_000)
  })
})

describe('getPlatformMrr', () => {
  it('sums what Stripe says each clinic pays', async () => {
    state.clinics = [
      clinic({ orgId: 'a', stripeSubscriptionId: 'sub_a' }),
      clinic({ orgId: 'b', stripeSubscriptionId: 'sub_b', planTier: 'pro' }),
    ]
    state.subs = [
      sub({ id: 'sub_a', unitAmountCents: 20_000 }),
      sub({ id: 'sub_b', unitAmountCents: 25_000 }),
    ]
    const mrr = await getPlatformMrr()
    expect(mrr.recognized.monthlyCents).toBe(45_000)
    expect(mrr.recognized.clinics).toBe(2)
    expect(mrr.recognized.byTier).toEqual({ basic: 0, pro: 1, premium: 1 })
    expect(mrr.stripeUnavailable).toBe(false)
  })

  it('a 3-seat quarterly clinic contributes its true monthly amount', async () => {
    state.clinics = [clinic()]
    state.subs = [sub({ unitAmountCents: 20_000, intervalCount: 3, quantity: 3 })]
    // $200 × 3 seats = $600 per quarter = $200/month. The old math said $600.
    expect((await getPlatformMrr()).recognized.monthlyCents).toBe(20_000)
  })

  it('recognized counts ACTIVE only; with-trialing includes the trials', async () => {
    state.clinics = [
      clinic({ orgId: 'a', stripeSubscriptionId: 'sub_a' }),
      clinic({ orgId: 'b', stripeSubscriptionId: 'sub_b', subscriptionStatus: 'trialing' }),
    ]
    state.subs = [
      sub({ id: 'sub_a', unitAmountCents: 20_000 }),
      sub({ id: 'sub_b', unitAmountCents: 20_000, status: 'trialing' }),
    ]
    const mrr = await getPlatformMrr()
    expect(mrr.recognized).toMatchObject({ clinics: 1, monthlyCents: 20_000 })
    expect(mrr.withTrialing).toMatchObject({ clinics: 2, monthlyCents: 40_000 })
  })

  it('a comped clinic with no subscription contributes a real 0 but still counts', async () => {
    // The tier constant used to credit this clinic its list price.
    state.clinics = [clinic({ orgId: 'comped', stripeSubscriptionId: null })]
    const mrr = await getPlatformMrr()
    expect(mrr.recognized.clinics).toBe(1)
    expect(mrr.recognized.monthlyCents).toBe(0)
    expect(mrr.monthlyCentsByOrg.get('comped')).toBe(0)
  })

  it('a subscription Stripe reports as canceled contributes nothing', async () => {
    state.clinics = [clinic()]
    state.subs = [sub({ status: 'canceled', unitAmountCents: 20_000 })]
    expect((await getPlatformMrr()).recognized.monthlyCents).toBe(0)
  })

  it('an unrecognised plan tier still counts as a clinic and still pays', async () => {
    state.clinics = [clinic({ planTier: 'legacy_gold' })]
    state.subs = [sub({ unitAmountCents: 20_000 })]
    const mrr = await getPlatformMrr()
    expect(mrr.recognized.clinics).toBe(1)
    expect(mrr.recognized.monthlyCents).toBe(20_000)
    expect(mrr.recognized.byTier).toEqual({ basic: 0, pro: 0, premium: 0 })
  })

  it('per-org amounts come back for the Clinics list column', async () => {
    state.clinics = [
      clinic({ orgId: 'a', stripeSubscriptionId: 'sub_a' }),
      clinic({ orgId: 'b', stripeSubscriptionId: 'sub_b' }),
    ]
    state.subs = [
      sub({ id: 'sub_a', unitAmountCents: 20_000 }),
      sub({ id: 'sub_b', unitAmountCents: 15_000 }),
    ]
    const mrr = await getPlatformMrr()
    expect(mrr.monthlyCentsByOrg.get('a')).toBe(20_000)
    expect(mrr.monthlyCentsByOrg.get('b')).toBe(15_000)
    // Every surface reads THIS map, so a per-clinic column and the MRR tile
    // are the same arithmetic.
    expect(Array.from(mrr.monthlyCentsByOrg.values()).reduce((a, b) => a + b, 0)).toBe(
      mrr.recognized.monthlyCents,
    )
  })

  it('an unreachable Stripe reports UNKNOWN money and REAL counts', async () => {
    state.clinics = [clinic({ orgId: 'a' }), clinic({ orgId: 'b', stripeSubscriptionId: 'sub_b' })]
    state.subsThrow = new Error('An error occurred with our connection to Stripe.')
    const mrr = await getPlatformMrr()
    expect(mrr.stripeUnavailable).toBe(true)
    // The counts come from our own database and are still true.
    expect(mrr.recognized.clinics).toBe(2)
    expect(mrr.recognized.monthlyCents).toBe(0)
    expect(warn).toHaveBeenCalled()
  })

  it('a fresh environment with no tables yet is an empty snapshot, not a crash', async () => {
    state.clinicsThrow = Object.assign(
      new Error('relation "clinic_profile" does not exist'),
      { code: '42P01' },
    )
    const mrr = await getPlatformMrr()
    expect(mrr.recognized.clinics).toBe(0)
    expect(mrr.stripeUnavailable).toBe(false)
  })

  it('a real database error is NOT swallowed', async () => {
    state.clinicsThrow = new Error('connection terminated unexpectedly')
    await expect(getPlatformMrr()).rejects.toThrow(/connection terminated/)
  })

  it('no clinics at all → zeroed, and Stripe is never asked', async () => {
    state.subsThrow = new Error('should not be called')
    const mrr = await getPlatformMrr()
    expect(mrr.recognized.clinics).toBe(0)
    expect(mrr.stripeUnavailable).toBe(false)
  })
})
