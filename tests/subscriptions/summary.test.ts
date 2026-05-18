import { describe, it, expect } from 'vitest'
import type { AdminSubscription } from '@/lib/services/stripe-admin'
import {
  monthlyContributionCents,
  pickAttentionSubscriptions,
  summarizeSubscriptions,
} from '@/lib/services/stripe-admin'

const DAY = 24 * 60 * 60
const NOW_MS = new Date('2026-05-18T12:00:00Z').getTime()
const NOW_SEC = Math.floor(NOW_MS / 1000)

function sub(overrides: Partial<AdminSubscription> = {}): AdminSubscription {
  return {
    id: overrides.id ?? 'sub_x',
    status: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: NOW_SEC + 14 * DAY,
    createdAt: NOW_SEC - 30 * DAY,
    customerId: 'cus_x',
    customerEmail: 'x@example.com',
    customerName: 'X Clinic',
    clinicOrgId: 'org_x',
    clinicName: 'X Clinic',
    itemId: 'si_x',
    priceId: 'price_pro_m',
    productId: 'prod_pro',
    productName: 'Pro',
    unitAmountCents: 14_900,
    currency: 'usd',
    interval: 'month',
    trialEnd: null,
    ...overrides,
  }
}

describe('monthlyContributionCents', () => {
  it('returns the unit amount for monthly active subs', () => {
    expect(monthlyContributionCents(sub({ status: 'active', interval: 'month', unitAmountCents: 14_900 }))).toBe(14_900)
  })

  it('counts trialing subs toward MRR', () => {
    expect(monthlyContributionCents(sub({ status: 'trialing', interval: 'month', unitAmountCents: 9_900 }))).toBe(9_900)
  })

  it('divides annual prices by 12', () => {
    expect(monthlyContributionCents(sub({ interval: 'year', unitAmountCents: 120_000 }))).toBe(10_000)
  })

  it('multiplies weekly prices by 4', () => {
    expect(monthlyContributionCents(sub({ interval: 'week', unitAmountCents: 5_000 }))).toBe(20_000)
  })

  it('returns 0 for canceled subs', () => {
    expect(monthlyContributionCents(sub({ status: 'canceled', unitAmountCents: 14_900 }))).toBe(0)
  })

  it('returns 0 for past_due subs', () => {
    expect(monthlyContributionCents(sub({ status: 'past_due', unitAmountCents: 14_900 }))).toBe(0)
  })

  it('returns 0 when unit amount is null', () => {
    expect(monthlyContributionCents(sub({ unitAmountCents: null }))).toBe(0)
  })
})

describe('summarizeSubscriptions', () => {
  it('returns zero stats for an empty list', () => {
    const stats = summarizeSubscriptions([])
    expect(stats.total).toBe(0)
    expect(stats.mrrCents).toBe(0)
    expect(stats.planMix).toEqual([])
  })

  it('aggregates counts and MRR across statuses', () => {
    const stats = summarizeSubscriptions(
      [
        sub({ id: 'a', status: 'active', productName: 'Pro', unitAmountCents: 14_900, interval: 'month' }),
        sub({ id: 'b', status: 'active', productName: 'Pro', unitAmountCents: 14_900, interval: 'month' }),
        sub({ id: 'c', status: 'trialing', productName: 'Premium', unitAmountCents: 19_900, interval: 'month', trialEnd: NOW_SEC + 3 * DAY }),
        sub({ id: 'd', status: 'past_due', productName: 'Basic', unitAmountCents: 9_900, interval: 'month' }),
        sub({ id: 'e', status: 'canceled', productName: 'Pro', unitAmountCents: 14_900, interval: 'month' }),
        sub({ id: 'f', status: 'active', cancelAtPeriodEnd: true, productName: 'Pro', unitAmountCents: 14_900, interval: 'month' }),
      ],
      { now: NOW_MS },
    )
    expect(stats.total).toBe(6)
    expect(stats.active).toBe(3) // a, b, f
    expect(stats.trialing).toBe(1) // c
    expect(stats.pastDue).toBe(1) // d
    expect(stats.canceled).toBe(1) // e
    expect(stats.scheduledCancel).toBe(1) // f
    expect(stats.trialEndingSoon).toBe(1) // c (3 days away, inside 7-day window)
    // MRR = a + b + c + f (past_due/canceled contribute 0)
    expect(stats.mrrCents).toBe(14_900 + 14_900 + 19_900 + 14_900)
    // Plan mix sorted by MRR desc — Pro (3 × 14900 = 44700) ahead of Premium (19900)
    expect(stats.planMix[0]).toMatchObject({ productName: 'Pro', count: 3, mrrCents: 44_700 })
    expect(stats.planMix[1]).toMatchObject({ productName: 'Premium', count: 1, mrrCents: 19_900 })
  })

  it('excludes trials beyond the 7-day window', () => {
    const stats = summarizeSubscriptions(
      [sub({ status: 'trialing', trialEnd: NOW_SEC + 20 * DAY })],
      { now: NOW_MS },
    )
    expect(stats.trialEndingSoon).toBe(0)
  })

  it('counts annual subs at 1/12 of their price in MRR', () => {
    const stats = summarizeSubscriptions([sub({ interval: 'year', unitAmountCents: 120_000 })])
    expect(stats.mrrCents).toBe(10_000)
  })

  it('groups unnamed products under Unknown', () => {
    const stats = summarizeSubscriptions([sub({ productName: null })])
    expect(stats.planMix[0].productName).toBe('Unknown')
  })

  it('does not count a canceled sub toward scheduledCancel even if flag is set', () => {
    const stats = summarizeSubscriptions([sub({ status: 'canceled', cancelAtPeriodEnd: true })])
    expect(stats.scheduledCancel).toBe(0)
  })
})

describe('pickAttentionSubscriptions', () => {
  it('returns trials ending in the next 7 days, sorted soonest first', () => {
    const out = pickAttentionSubscriptions(
      [
        sub({ id: 'far', status: 'trialing', trialEnd: NOW_SEC + 6 * DAY }),
        sub({ id: 'soon', status: 'trialing', trialEnd: NOW_SEC + 1 * DAY }),
        sub({ id: 'past', status: 'trialing', trialEnd: NOW_SEC - 1 * DAY }), // expired
        sub({ id: 'way_out', status: 'trialing', trialEnd: NOW_SEC + 30 * DAY }),
      ],
      { now: NOW_MS },
    )
    expect(out.trialEndingSoon.map((s) => s.id)).toEqual(['soon', 'far'])
  })

  it('groups past_due and unpaid into the past-due bucket', () => {
    const out = pickAttentionSubscriptions(
      [
        sub({ id: 'a', status: 'past_due' }),
        sub({ id: 'b', status: 'unpaid' }),
        sub({ id: 'c', status: 'active' }),
      ],
      { now: NOW_MS },
    )
    expect(out.pastDue.map((s) => s.id).sort()).toEqual(['a', 'b'])
  })

  it('excludes already-canceled subs from scheduledCancel', () => {
    const out = pickAttentionSubscriptions(
      [
        sub({ id: 'a', status: 'active', cancelAtPeriodEnd: true }),
        sub({ id: 'b', status: 'canceled', cancelAtPeriodEnd: true }),
      ],
      { now: NOW_MS },
    )
    expect(out.scheduledCancel.map((s) => s.id)).toEqual(['a'])
  })

  it('returns empty buckets when nothing needs attention', () => {
    const out = pickAttentionSubscriptions([sub({ status: 'active' })], { now: NOW_MS })
    expect(out.trialEndingSoon).toEqual([])
    expect(out.pastDue).toEqual([])
    expect(out.scheduledCancel).toEqual([])
  })
})
