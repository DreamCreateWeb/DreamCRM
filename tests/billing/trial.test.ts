import { describe, it, expect } from 'vitest'
import {
  TRIAL_DAYS,
  resolveTrialState,
  hasPaidSubscription,
  trialEndDate,
  trialDaysLeft,
  trialDaysLeftLabel,
  trialUrgency,
  trialHeadline,
  trialSubline,
  dueTrialReminder,
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

describe('trialUrgency — escalating tiers', () => {
  it('steps calm → soon → urgent → final as the trial winds down', () => {
    expect(trialUrgency(7)).toBe('calm')
    expect(trialUrgency(4)).toBe('calm')
    expect(trialUrgency(3)).toBe('soon')
    expect(trialUrgency(2)).toBe('soon')
    expect(trialUrgency(1)).toBe('urgent')
    expect(trialUrgency(0)).toBe('final')
    expect(trialUrgency(null)).toBe('calm')
  })

  it('headline + subline escalate with the tier', () => {
    expect(trialHeadline(0)).toMatch(/ends today/i)
    expect(trialHeadline(1)).toMatch(/tomorrow/i)
    expect(trialHeadline(3)).toMatch(/only 3 days/i)
    expect(trialHeadline(6)).toMatch(/6 days left/i)
    // the closer it gets, the more it spells out what's at stake
    expect(trialSubline(0)).toMatch(/now/i)
    expect(trialSubline(6)).toMatch(/whenever you're ready/i)
  })
})

describe('dueTrialReminder — which email to send', () => {
  it('fires d3 / d1 / ended at the right moments', () => {
    expect(dueTrialReminder(3, false, [])).toBe('d3')
    expect(dueTrialReminder(2, false, [])).toBe('d3') // still the 3-day bucket
    expect(dueTrialReminder(1, false, [])).toBe('d1') // d1 covers the whole final day
    expect(dueTrialReminder(0, true, [])).toBe('ended')
    expect(dueTrialReminder(5, false, [])).toBeNull() // too early
  })

  it('is idempotent — never re-sends a milestone already recorded', () => {
    expect(dueTrialReminder(3, false, ['d3'])).toBeNull()
    expect(dueTrialReminder(1, false, ['d3'])).toBe('d1')
    expect(dueTrialReminder(1, false, ['d3', 'd1'])).toBeNull()
    expect(dueTrialReminder(0, true, ['d3', 'd1'])).toBe('ended')
    expect(dueTrialReminder(0, true, ['ended'])).toBeNull()
  })
})
