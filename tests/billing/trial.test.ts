import { describe, it, expect } from 'vitest'
import {
  TRIAL_DAYS,
  resolveTrialState,
  hasPaidSubscription,
  trialEndDate,
  trialDaysLeft,
  trialDaysLeftLabel,
} from '@/lib/trial'

/**
 * The no-card free-trial logic. Pure + deterministic — these pin the access
 * rules the dashboard gate, banner, and lock wall all read from.
 */

const NOW = new Date('2026-06-16T12:00:00Z')
const inDays = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000)

describe('resolveTrialState', () => {
  it('on an active trial → onTrial, not expired, days left', () => {
    const s = resolveTrialState(
      { trialEndsAt: inDays(7), subscriptionStatus: 'trialing', stripeSubscriptionId: null },
      NOW,
    )
    expect(s).toEqual({ onTrial: true, expired: false, trialEndsAt: inDays(7), daysLeft: 7 })
  })

  it('rounds partial days UP (a few hours left is still "1 day")', () => {
    expect(resolveTrialState({ trialEndsAt: inDays(0.25), subscriptionStatus: 'trialing', stripeSubscriptionId: null }, NOW).daysLeft).toBe(1)
  })

  it('past the end with no paid sub → expired (lock)', () => {
    const s = resolveTrialState(
      { trialEndsAt: inDays(-1), subscriptionStatus: 'trialing', stripeSubscriptionId: null },
      NOW,
    )
    expect(s.onTrial).toBe(false)
    expect(s.expired).toBe(true)
    expect(s.daysLeft).toBe(0)
  })

  it('a PAID subscription always wins — never on trial, never expired', () => {
    // Even with a past trial end, an active paid sub is full access.
    const s = resolveTrialState(
      { trialEndsAt: inDays(-30), subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' },
      NOW,
    )
    expect(s).toEqual({ onTrial: false, expired: false, trialEndsAt: inDays(-30), daysLeft: null })
  })

  it('past_due (dunning) still counts as paid — not locked', () => {
    const s = resolveTrialState(
      { trialEndsAt: inDays(-1), subscriptionStatus: 'past_due', stripeSubscriptionId: 'sub_1' },
      NOW,
    )
    expect(s.expired).toBe(false)
  })

  it('no trial set (comped / demo / legacy) → never trial-gated', () => {
    const s = resolveTrialState({ trialEndsAt: null, subscriptionStatus: null, stripeSubscriptionId: null }, NOW)
    expect(s).toEqual({ onTrial: false, expired: false, trialEndsAt: null, daysLeft: null })
  })

  it('canceled sub with an expired trial → expired (must re-subscribe)', () => {
    const s = resolveTrialState(
      { trialEndsAt: inDays(-1), subscriptionStatus: 'canceled', stripeSubscriptionId: 'sub_1' },
      NOW,
    )
    expect(s.expired).toBe(true)
  })
})

describe('hasPaidSubscription', () => {
  it('active / past_due with a sub id → true', () => {
    expect(hasPaidSubscription({ subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' })).toBe(true)
    expect(hasPaidSubscription({ subscriptionStatus: 'past_due', stripeSubscriptionId: 'sub_1' })).toBe(true)
  })
  it('trialing / canceled / null → false', () => {
    expect(hasPaidSubscription({ subscriptionStatus: 'trialing', stripeSubscriptionId: null })).toBe(false)
    expect(hasPaidSubscription({ subscriptionStatus: 'canceled', stripeSubscriptionId: 'sub_1' })).toBe(false)
    expect(hasPaidSubscription({ subscriptionStatus: null, stripeSubscriptionId: null })).toBe(false)
  })
  it('active status WITHOUT a sub id is not "paid" (defensive)', () => {
    expect(hasPaidSubscription({ subscriptionStatus: 'active', stripeSubscriptionId: null })).toBe(false)
  })
})

describe('helpers', () => {
  it('trialEndDate is TRIAL_DAYS out', () => {
    expect(trialEndDate(NOW).getTime()).toBe(inDays(TRIAL_DAYS).getTime())
  })
  it('trialDaysLeft ceils and floors at 0', () => {
    expect(trialDaysLeft(inDays(3), NOW)).toBe(3)
    expect(trialDaysLeft(inDays(-5), NOW)).toBe(0)
    expect(trialDaysLeft(null, NOW)).toBeNull()
  })
  it('trialDaysLeftLabel reads naturally', () => {
    expect(trialDaysLeftLabel(5)).toMatch(/5 days left/)
    expect(trialDaysLeftLabel(1)).toMatch(/1 day left/)
    expect(trialDaysLeftLabel(0)).toMatch(/ends today/)
    expect(trialDaysLeftLabel(null)).toBe('')
  })
})
