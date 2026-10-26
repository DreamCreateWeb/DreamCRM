/**
 * THE PLATFORM'S READ OF A CLINIC'S STANDING — pure + client-safe.
 *
 * `clinic_profile.subscription_status` is written at signup / provisioning
 * ('trialing') and afterwards only by Stripe's webhooks and the cancel path.
 * Nothing flips it when the 7-day no-card trial runs out: the billing wall
 * and the engine kill are DERIVED from `trial_ends_at` through
 * `resolveTrialState` (lib/trial.ts, lib/services/billing-state.ts). So a
 * clinic that has been locked behind the wall for a month still carries
 * 'trialing' in that column, and every platform surface that read the column
 * alone painted it healthy, counted it active, and added it to MRR.
 *
 * This module is the one home for the platform-facing answer. The Clinics
 * list, its KPI row, the clinic detail page and the MRR derivation all ask
 * here, so "how many live clinics do I have?" has one answer — the same one
 * the first-week board and the wall itself give.
 */
import type { TrialState } from '@/lib/trial'
import type { Tone } from '@/lib/ui/encodings'

export interface ClinicStandingInput {
  subscriptionStatus: string | null
  /** From `resolveTrialState` over the clinic's own billing fields. */
  trial: TrialState
}

/** Stripe's past-due family — a payment problem happening now. */
export function isPastDueStatus(status: string | null): boolean {
  return status === 'past_due' || status === 'unpaid' || status === 'incomplete_expired'
}

/**
 * Counts as a live clinic: recorded active or trialing AND not behind the
 * trial wall. An expired no-card trial keeps 'trialing' in the column, but
 * the practice can't sign in, its site is dark and its engines are stopped —
 * that is not an active subscriber.
 */
export function clinicCountsAsActive(c: ClinicStandingInput): boolean {
  if (c.trial.expired) return false
  return c.subscriptionStatus === 'active' || c.subscriptionStatus === 'trialing'
}

/** Subscription status → tone, for the plain Stripe statuses. */
export function subscriptionStatusTone(status: string | null): Tone {
  if (status === 'active' || status === 'trialing') return 'ok'
  if (isPastDueStatus(status)) return 'urgent'
  return 'neutral'
}

export interface ClinicStatusPillInput extends ClinicStandingInput {
  /** A managed clinic whose owner has not accepted the invite yet. */
  ownerInvitePending?: boolean
  /** 'self_serve' | 'managed' | 'comped'. */
  billingMode?: string | null
  /** Managed clinics: the reserved plan awaiting the activation checkout. */
  pendingPlanId?: string | null
}

export interface ClinicStatusPill {
  tone: Tone
  label: string
  title?: string
}

/** The number of days left as the pill says it. */
function daysLeftWords(daysLeft: number | null): string {
  const n = daysLeft ?? 0
  if (n <= 0) return 'ends today'
  return `${n} ${n === 1 ? 'day' : 'days'} left`
}

/**
 * The one status pill for a clinic row. Precedence, most-blocking first:
 * the owner has not even accepted the invite → the trial has run out → the
 * trial is running (warn inside two days, like the first-week board) → the
 * plain Stripe status. 'setup pending' used to key on the RESERVED plan,
 * which stays reserved for the whole trial, so an accepted, in-use managed
 * clinic read as "waiting on them to accept" for its first week.
 */
export function clinicStatusPill(c: ClinicStatusPillInput): ClinicStatusPill {
  if (c.ownerInvitePending) {
    return {
      tone: 'info',
      label: 'invite pending',
      title: 'Owner invited — waiting on them to accept',
    }
  }
  if (c.trial.expired) {
    return {
      tone: 'urgent',
      label: 'trial ended',
      title: 'The free trial ran out with no plan chosen — behind the billing wall',
    }
  }
  if (c.trial.onTrial) {
    const reserved = c.billingMode === 'managed' && !!c.pendingPlanId
    return {
      tone: c.trial.daysLeft != null && c.trial.daysLeft <= 2 ? 'warn' : 'info',
      label: `trial · ${daysLeftWords(c.trial.daysLeft)}`,
      title: reserved
        ? 'On the free trial with their plan reserved — it activates when the owner checks out'
        : 'On the free trial — full access until it ends',
    }
  }
  const status = c.subscriptionStatus ?? 'inactive'
  return { tone: subscriptionStatusTone(status), label: status.replace('_', ' ') }
}
