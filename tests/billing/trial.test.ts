import { describe, it, expect } from 'vitest'
import {
  AWAITING_CARD_STATUS,
  TRIAL_DAYS,
  cardOnFileTrialLine,
  resolveTrialState,
  hasCardOnFileTrial,
  hasPaidSubscription,
  trialReminderKind,
  trialEndDate,
  trialDaysLeft,
  trialDaysLeftLabel,
  trialUrgency,
  trialHeadline,
  trialSubline,
  dueTrialReminder,
} from '@/lib/trial'

/**
 * The free-trial logic. Pure + deterministic — these pin the access rules the
 * dashboard gate, banner, and lock wall all read from.
 *
 * Three kinds of clinic (owner ruling 2026-11-23 — 14 days, card required to
 * sign up): a signup that has not added its card, a Stripe trial with the
 * card on file, and the no-card trial every clinic used to start on and a
 * hand-provisioned one still does.
 */

const NOW = new Date('2026-06-16T12:00:00Z')
const inDays = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000)

describe('resolveTrialState', () => {
  it('on an active trial → onTrial, not expired, days left', () => {
    const s = resolveTrialState(
      { trialEndsAt: inDays(7), subscriptionStatus: 'trialing', stripeSubscriptionId: null },
      NOW,
    )
    expect(s).toEqual({ onTrial: true, expired: false, trialEndsAt: inDays(7), daysLeft: 7, needsCard: false, cardOnFile: false })
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
    expect(s).toEqual({ onTrial: false, expired: false, trialEndsAt: inDays(-30), daysLeft: null, needsCard: false, cardOnFile: false })
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
    expect(s).toEqual({ onTrial: false, expired: false, trialEndsAt: null, daysLeft: null, needsCard: false, cardOnFile: false })
  })

  it('canceled sub with an expired trial → expired (must re-subscribe)', () => {
    const s = resolveTrialState(
      { trialEndsAt: inDays(-1), subscriptionStatus: 'canceled', stripeSubscriptionId: 'sub_1' },
      NOW,
    )
    expect(s.expired).toBe(true)
  })
})

describe('the trial is 14 days and starts with a card (owner ruling 2026-11-23)', () => {
  it('TRIAL_DAYS is 14', () => {
    expect(TRIAL_DAYS).toBe(14)
  })

  it('a signup with no card yet is CLOSED and has no clock — the trial has not started', () => {
    const s = resolveTrialState(
      { trialEndsAt: null, subscriptionStatus: AWAITING_CARD_STATUS, stripeSubscriptionId: null },
      NOW,
    )
    // `expired` is the one flag every gate asks (wall, public site, engines);
    // `needsCard` is what keeps the wall from saying a trial "ended".
    expect(s).toEqual({ onTrial: false, expired: true, trialEndsAt: null, daysLeft: null, needsCard: true, cardOnFile: false })
  })

  it('a stray end date on an awaiting-card row never opens it', () => {
    const s = resolveTrialState(
      { trialEndsAt: inDays(5), subscriptionStatus: AWAITING_CARD_STATUS, stripeSubscriptionId: null },
      NOW,
    )
    expect(s.onTrial).toBe(false)
    expect(s.expired).toBe(true)
    expect(s.needsCard).toBe(true)
  })

  it('a Stripe trial with the card on file is ON TRIAL, counting down to Stripe’s date', () => {
    const s = resolveTrialState(
      { trialEndsAt: inDays(14), subscriptionStatus: 'trialing', stripeSubscriptionId: 'sub_1' },
      NOW,
    )
    expect(s).toEqual({ onTrial: true, expired: false, trialEndsAt: inDays(14), daysLeft: 14, needsCard: false, cardOnFile: true })
  })

  it('STRIPE OWNS THAT CLOCK: past the end date with the webhook still on its way, the clinic is NOT walled', () => {
    // At the trial end Stripe turns the trial into a paid subscription and
    // tells us by webhook. Until that lands the column still says 'trialing'
    // with an end date in the past — which, read on our clock, is "expired",
    // and would dark a paying practice's website on a late webhook.
    const s = resolveTrialState(
      { trialEndsAt: inDays(-0.1), subscriptionStatus: 'trialing', stripeSubscriptionId: 'sub_1' },
      NOW,
    )
    expect(s.expired).toBe(false)
    expect(s.onTrial).toBe(true)
    expect(s.daysLeft).toBe(0)
  })

  it('a card-on-file trial whose end date never synced still has access (no clock to read)', () => {
    const s = resolveTrialState({ trialEndsAt: null, subscriptionStatus: 'trialing', stripeSubscriptionId: 'sub_1' }, NOW)
    expect(s).toMatchObject({ onTrial: true, expired: false, daysLeft: null, cardOnFile: true })
  })

  it('the NO-card trial is unchanged: our clock, and it locks when it runs out', () => {
    const running = resolveTrialState({ trialEndsAt: inDays(2), subscriptionStatus: 'trialing', stripeSubscriptionId: null }, NOW)
    expect(running).toMatchObject({ onTrial: true, expired: false, cardOnFile: false, needsCard: false })
    const over = resolveTrialState({ trialEndsAt: inDays(-2), subscriptionStatus: 'trialing', stripeSubscriptionId: null }, NOW)
    expect(over).toMatchObject({ onTrial: false, expired: true, cardOnFile: false, needsCard: false })
  })

  it('cancelled during the card-on-file trial: Stripe deleted the subscription, so the rest of the window is a plain no-card trial', () => {
    // clearSubscription writes 'canceled' and drops the subscription id.
    const s = resolveTrialState({ trialEndsAt: inDays(9), subscriptionStatus: 'canceled', stripeSubscriptionId: null }, NOW)
    expect(s).toMatchObject({ onTrial: true, expired: false, daysLeft: 9, cardOnFile: false, needsCard: false })
  })

  it('hasCardOnFileTrial needs BOTH halves — a no-card trial also carries "trialing" in the column', () => {
    expect(hasCardOnFileTrial({ subscriptionStatus: 'trialing', stripeSubscriptionId: 'sub_1' })).toBe(true)
    expect(hasCardOnFileTrial({ subscriptionStatus: 'trialing', stripeSubscriptionId: null })).toBe(false)
    expect(hasCardOnFileTrial({ subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' })).toBe(false)
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

describe('dueTrialReminder — a card-on-file trial is told WHEN IT IS CHARGED, never asked for a card', () => {
  it('fires d7 a week out and d1 on the last day', () => {
    expect(dueTrialReminder(14, false, [], 'card_on_file')).toBeNull() // too early
    expect(dueTrialReminder(8, false, [], 'card_on_file')).toBeNull()
    expect(dueTrialReminder(7, false, [], 'card_on_file')).toBe('d7')
    expect(dueTrialReminder(4, false, [], 'card_on_file')).toBe('d7')
    expect(dueTrialReminder(2, false, ['d7'], 'card_on_file')).toBeNull() // no d3 on this schedule
    expect(dueTrialReminder(1, false, ['d7'], 'card_on_file')).toBe('d1')
    expect(dueTrialReminder(0, false, ['d7'], 'card_on_file')).toBe('d1')
  })

  it('is idempotent, and never sends "your trial has ended" — that trial becomes a subscription', () => {
    expect(dueTrialReminder(6, false, ['d7'], 'card_on_file')).toBeNull()
    expect(dueTrialReminder(1, false, ['d7', 'd1'], 'card_on_file')).toBeNull()
    expect(dueTrialReminder(0, true, [], 'card_on_file')).toBeNull()
    expect(dueTrialReminder(null, false, [], 'card_on_file')).toBeNull()
  })

  it('a signup that never added a card gets NO trial reminder at all', () => {
    // Its state reads `expired`, which on the no-card schedule is the
    // "your free trial has ended" email — false for someone who never began.
    expect(dueTrialReminder(null, true, [], 'needs_card')).toBeNull()
    expect(dueTrialReminder(0, true, [], 'needs_card')).toBeNull()
  })

  it('the no-card schedule has no d7 (a 14-day no-card trial still hears at 3 days and 1)', () => {
    expect(dueTrialReminder(7, false, [])).toBeNull()
    expect(dueTrialReminder(3, false, [])).toBe('d3')
  })

  it('trialReminderKind reads the schedule off the resolved state', () => {
    const awaiting = resolveTrialState({ trialEndsAt: null, subscriptionStatus: AWAITING_CARD_STATUS, stripeSubscriptionId: null }, NOW)
    const onFile = resolveTrialState({ trialEndsAt: inDays(6), subscriptionStatus: 'trialing', stripeSubscriptionId: 'sub_1' }, NOW)
    const noCard = resolveTrialState({ trialEndsAt: inDays(6), subscriptionStatus: 'trialing', stripeSubscriptionId: null }, NOW)
    expect(trialReminderKind(awaiting)).toBe('needs_card')
    expect(trialReminderKind(onFile)).toBe('card_on_file')
    expect(trialReminderKind(noCard)).toBe('no_card')
  })
})

describe('cardOnFileTrialLine — one fact, no ask', () => {
  it('says when the card is charged at every distance, and never asks for a card', () => {
    for (const d of [null, 0, 1, 2, 14] as const) {
      const line = cardOnFileTrialLine(d)
      expect(line).toMatch(/card is charged/)
      expect(line).not.toMatch(/add a|no card|set up billing|choose a plan/i)
    }
    expect(cardOnFileTrialLine(14)).toMatch(/^14 days left/)
    expect(cardOnFileTrialLine(1)).toMatch(/tomorrow/)
    expect(cardOnFileTrialLine(0)).toMatch(/today/)
  })
})
