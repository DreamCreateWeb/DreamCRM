/**
 * No-card free-trial logic — the single source of truth for "is this clinic on
 * a trial / has it expired / how many days are left". PURE + client-safe (no
 * `server-only`, no DB): `getTenantContext` feeds it the clinic_profile billing
 * fields it already loads, and the banner/wall render from the result.
 *
 * Model (decided 2026-06-16): every clinic starts a 7-day trial with FULL
 * Premium access and NO card on file (self-serve signup + platform-managed
 * provisioning both set `trial_ends_at`). They set up billing within the 7 days;
 * on expiry without a paid subscription they're LOCKED to the billing wall.
 *
 *   - A real PAID subscription always wins over the trial: once
 *     `stripeSubscriptionId` is set and the status is active/past_due, the trial
 *     fields are ignored (no banner, no lock).
 *   - `trial_ends_at == null` means "never on a trial" — comped clinics, the
 *     demo, and any legacy row. Those are never trial-gated.
 */

/** Length of the free trial, in days. */
export const TRIAL_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/** The billing fields the trial logic needs (a subset of clinic_profile). */
export interface TrialInput {
  trialEndsAt: Date | null
  subscriptionStatus: string | null
  stripeSubscriptionId: string | null
}

export interface TrialState {
  /** On an active trial right now (full access, prompt to set up billing). */
  onTrial: boolean
  /** Trial ended with no paid subscription → lock the dashboard. */
  expired: boolean
  /** The trial end instant, when one is set (for display). */
  trialEndsAt: Date | null
  /** Whole days remaining (ceil, never negative) while `onTrial`; else null. */
  daysLeft: number | null
}

/**
 * A clinic counts as having a real PAID subscription — which overrides any
 * trial — when Stripe has handed us a subscription id AND its status is one that
 * grants access. `past_due` still has access (dunning handles the nudge); a
 * `canceled`/`unpaid`/`incomplete` sub does NOT keep the trial alive.
 */
export function hasPaidSubscription(input: Pick<TrialInput, 'subscriptionStatus' | 'stripeSubscriptionId'>): boolean {
  if (!input.stripeSubscriptionId) return false
  return input.subscriptionStatus === 'active' || input.subscriptionStatus === 'past_due'
}

/** Resolve the trial state for a clinic. Pure + deterministic. */
export function resolveTrialState(input: TrialInput, now: Date = new Date()): TrialState {
  // A paid subscription, or a clinic that was never put on a trial, is never
  // trial-gated.
  if (hasPaidSubscription(input) || !input.trialEndsAt) {
    return { onTrial: false, expired: false, trialEndsAt: input.trialEndsAt ?? null, daysLeft: null }
  }
  const remainingMs = input.trialEndsAt.getTime() - now.getTime()
  if (remainingMs > 0) {
    return {
      onTrial: true,
      expired: false,
      trialEndsAt: input.trialEndsAt,
      daysLeft: Math.max(0, Math.ceil(remainingMs / DAY_MS)),
    }
  }
  return { onTrial: false, expired: true, trialEndsAt: input.trialEndsAt, daysLeft: 0 }
}

/** The trial end instant for a trial starting now (signup / provisioning). */
export function trialEndDate(now: Date = new Date()): Date {
  return new Date(now.getTime() + TRIAL_DAYS * DAY_MS)
}

/** Whole days left until `trialEndsAt` (ceil, never negative), or null. */
export function trialDaysLeft(trialEndsAt: Date | null, now: Date = new Date()): number | null {
  if (!trialEndsAt) return null
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS))
}

/** A friendly "N days left" / "last day" label for the trial banner. */
export function trialDaysLeftLabel(daysLeft: number | null): string {
  if (daysLeft == null) return ''
  if (daysLeft <= 0) return 'Your trial ends today'
  if (daysLeft === 1) return '1 day left in your free trial'
  return `${daysLeft} days left in your free trial`
}
