import { describe, it, expect } from 'vitest'
import { resolveTrialState, type TrialState } from '@/lib/trial'
import {
  clinicCountsAsActive,
  clinicStatusPill,
  isPastDueStatus,
  subscriptionStatusTone,
} from '@/lib/platform-clinic-status'

/**
 * THE PLATFORM'S READ OF A CLINIC'S STANDING (lib/platform-clinic-status.ts).
 *
 * `subscription_status` is written 'trialing' at signup and then only by
 * Stripe and the cancel path — nothing flips it when the 7-day trial runs
 * out, because the wall is DERIVED from `trial_ends_at`. So every platform
 * surface that read the column alone painted a shut-down clinic green and
 * counted it active. These pin the one shared answer.
 */

const NOW = new Date('2026-10-26T12:00:00Z')
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

function trial(over: Partial<{ trialEndsAt: Date | null; subscriptionStatus: string | null; stripeSubscriptionId: string | null }> = {}): TrialState {
  return resolveTrialState(
    { trialEndsAt: inDays(5), subscriptionStatus: 'trialing', stripeSubscriptionId: null, ...over },
    NOW,
  )
}

describe('clinicCountsAsActive', () => {
  it('active and in-trial clinics count', () => {
    expect(clinicCountsAsActive({ subscriptionStatus: 'active', trial: trial({ trialEndsAt: null, subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' }) })).toBe(true)
    expect(clinicCountsAsActive({ subscriptionStatus: 'trialing', trial: trial() })).toBe(true)
  })

  it('an EXPIRED trial does not, even though the column still says trialing', () => {
    // The defect: the column is never flipped, so the roster lied in the
    // direction that hides churn.
    expect(clinicCountsAsActive({ subscriptionStatus: 'trialing', trial: trial({ trialEndsAt: inDays(-30) }) })).toBe(false)
  })

  it('canceled, past-due and no-status clinics do not', () => {
    expect(clinicCountsAsActive({ subscriptionStatus: 'canceled', trial: trial({ trialEndsAt: null }) })).toBe(false)
    expect(clinicCountsAsActive({ subscriptionStatus: 'past_due', trial: trial({ trialEndsAt: null }) })).toBe(false)
    expect(clinicCountsAsActive({ subscriptionStatus: null, trial: trial({ trialEndsAt: null }) })).toBe(false)
  })

  it('a paid subscription with a stale trial_ends_at is still active (a paid sub always wins)', () => {
    expect(
      clinicCountsAsActive({
        subscriptionStatus: 'active',
        trial: trial({ trialEndsAt: inDays(-30), subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' }),
      }),
    ).toBe(true)
  })
})

describe('isPastDueStatus / subscriptionStatusTone', () => {
  it('the past-due family is urgent; active and trialing are ok; the rest inert', () => {
    for (const s of ['past_due', 'unpaid', 'incomplete_expired']) {
      expect(isPastDueStatus(s)).toBe(true)
      expect(subscriptionStatusTone(s)).toBe('urgent')
    }
    expect(isPastDueStatus('active')).toBe(false)
    expect(subscriptionStatusTone('active')).toBe('ok')
    expect(subscriptionStatusTone('trialing')).toBe('ok')
    expect(subscriptionStatusTone('canceled')).toBe('neutral')
    expect(subscriptionStatusTone(null)).toBe('neutral')
  })
})

describe('clinicStatusPill', () => {
  it('an unaccepted owner invite comes first — the only state Resend can succeed in', () => {
    const pill = clinicStatusPill({ subscriptionStatus: 'trialing', trial: trial(), ownerInvitePending: true, billingMode: 'managed', pendingPlanId: 'premium' })
    expect(pill).toMatchObject({ tone: 'info', label: 'invite pending' })
    expect(pill.title).toMatch(/waiting on them to accept/i)
  })

  it('a RESERVED plan is not "setup pending": an accepted managed clinic shows its trial, with the reservation in the title', () => {
    // The reserved plan stays reserved for the whole trial — keying the pill
    // on it read "waiting on them to accept" for the week after they did.
    const pill = clinicStatusPill({ subscriptionStatus: 'trialing', trial: trial(), ownerInvitePending: false, billingMode: 'managed', pendingPlanId: 'premium' })
    expect(pill).toMatchObject({ tone: 'info', label: 'trial · 5 days left' })
    expect(pill.title).toMatch(/plan reserved/i)
    expect(pill.label).not.toMatch(/setup pending/)
  })

  it('a self-serve trial carries no reservation wording', () => {
    const pill = clinicStatusPill({ subscriptionStatus: 'trialing', trial: trial(), billingMode: 'self_serve', pendingPlanId: null })
    expect(pill.title).not.toMatch(/reserved/i)
  })

  it('warns inside two days, and says "1 day", "ends today"', () => {
    expect(clinicStatusPill({ subscriptionStatus: 'trialing', trial: trial({ trialEndsAt: inDays(3) }) })).toMatchObject({ tone: 'info', label: 'trial · 3 days left' })
    expect(clinicStatusPill({ subscriptionStatus: 'trialing', trial: trial({ trialEndsAt: inDays(2) }) })).toMatchObject({ tone: 'warn', label: 'trial · 2 days left' })
    expect(clinicStatusPill({ subscriptionStatus: 'trialing', trial: trial({ trialEndsAt: inDays(0.5) }) })).toMatchObject({ tone: 'warn', label: 'trial · 1 day left' })
    expect(clinicStatusPill({ subscriptionStatus: 'trialing', trial: { onTrial: true, expired: false, trialEndsAt: NOW, daysLeft: 0 } })).toMatchObject({ tone: 'warn', label: 'trial · ends today' })
  })

  it('an expired trial is URGENT "trial ended" — never the column\'s "trialing"', () => {
    const pill = clinicStatusPill({ subscriptionStatus: 'trialing', trial: trial({ trialEndsAt: inDays(-1) }) })
    expect(pill).toMatchObject({ tone: 'urgent', label: 'trial ended' })
    expect(pill.title).toMatch(/billing wall/i)
  })

  it('an expired trial outranks a still-reserved plan', () => {
    const pill = clinicStatusPill({ subscriptionStatus: 'trialing', trial: trial({ trialEndsAt: inDays(-1) }), billingMode: 'managed', pendingPlanId: 'premium' })
    expect(pill.label).toBe('trial ended')
  })

  it('otherwise the plain Stripe status, underscores spaced', () => {
    const never = trial({ trialEndsAt: null, subscriptionStatus: 'past_due', stripeSubscriptionId: 'sub_1' })
    expect(clinicStatusPill({ subscriptionStatus: 'past_due', trial: never })).toEqual({ tone: 'urgent', label: 'past due' })
    expect(clinicStatusPill({ subscriptionStatus: 'active', trial: { ...never } })).toEqual({ tone: 'ok', label: 'active' })
    expect(clinicStatusPill({ subscriptionStatus: null, trial: { ...never } })).toEqual({ tone: 'neutral', label: 'inactive' })
  })
})
