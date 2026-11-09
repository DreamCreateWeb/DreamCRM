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

// ── STANDING (ML-40) — the one word the platform sorts and filters clinics by ──

export type ClinicStandingKind = 'invite_pending' | 'trial' | 'live' | 'past_due' | 'walled' | 'churned'

export interface ClinicStanding {
  kind: ClinicStandingKind
  /** The plain word the chip and the legend wear. */
  label: string
  tone: Tone
  /** Trial only: whole days left (null when not on a trial). */
  daysLeft: number | null
}

/** The filter chips, in the order the owner reads them. */
export const STANDING_ORDER: ReadonlyArray<{ kind: ClinicStandingKind; label: string; meaning: string }> = [
  { kind: 'trial', label: 'Trial', meaning: 'On the free trial — full access until it ends' },
  { kind: 'live', label: 'Live', meaning: 'Paying (or comped) and not behind the wall' },
  { kind: 'past_due', label: 'Past due', meaning: 'A payment failed — needs a human' },
  { kind: 'walled', label: 'Walled', meaning: 'The trial ran out with no plan — behind the billing wall, site dark, engines stopped' },
  { kind: 'churned', label: 'Churned', meaning: 'No live subscription — cancelled or never started' },
  { kind: 'invite_pending', label: 'Invite pending', meaning: 'We created the clinic; the owner has not accepted the invite yet' },
]

function standingLabel(k: ClinicStandingKind): string {
  return STANDING_ORDER.find((s) => s.kind === k)?.label ?? k
}

/**
 * A clinic's STANDING, derived from THE read (the trial wall over the Stripe
 * column). Precedence, most-blocking first: invite not accepted → behind the
 * wall → on the trial → past due → no live subscription → live. Reading
 * `subscriptionStatus` alone would call a walled clinic 'trialing'.
 */
export function clinicStanding(c: ClinicStandingInput & { ownerInvitePending?: boolean }): ClinicStanding {
  if (c.ownerInvitePending) return { kind: 'invite_pending', label: standingLabel('invite_pending'), tone: 'info', daysLeft: null }
  if (c.trial.expired) return { kind: 'walled', label: standingLabel('walled'), tone: 'urgent', daysLeft: null }
  if (c.trial.onTrial) {
    const d = c.trial.daysLeft
    return { kind: 'trial', label: standingLabel('trial'), tone: d != null && d <= 2 ? 'warn' : 'info', daysLeft: d }
  }
  if (isPastDueStatus(c.subscriptionStatus)) return { kind: 'past_due', label: standingLabel('past_due'), tone: 'urgent', daysLeft: null }
  if (c.subscriptionStatus === 'active' || c.subscriptionStatus === 'trialing') {
    return { kind: 'live', label: standingLabel('live'), tone: 'ok', daysLeft: null }
  }
  return { kind: 'churned', label: standingLabel('churned'), tone: 'neutral', daysLeft: null }
}

/** A trial this close to its end with nothing activated is worth a call. */
export const STUCK_TRIAL_DAYS_LEFT = 2
/** A trialing clinic nobody has signed into for this long is drifting. */
export const STUCK_NO_LOGIN_DAYS = 7

export interface StuckOpts {
  /** Has the clinic reached its first activation (A1, data connected)? Unknown → treated as activated (never accuse on a failed read). */
  activated?: boolean
  /** The clinic's creation instant — the clock for "never signed in". */
  createdAt?: Date | null
}

/**
 * THE "stuck" rule the Overview's "Needs a hand" band asks (and nothing
 * else). Pure. Stuck when the clinic is walled, past due, a trial inside two
 * days of its end with no activation, or a trialing clinic with no staff
 * sign-in in 7 days (a clinic that never signed in counts from creation).
 * Churned and live clinics are never stuck; an unaccepted invite is the
 * list's job, not this band's.
 */
export function clinicIsStuck(standing: ClinicStanding, lastSeenAt: Date | null, now: Date, opts: StuckOpts = {}): boolean {
  switch (standing.kind) {
    case 'walled':
    case 'past_due':
      return true
    case 'trial': {
      if (standing.daysLeft != null && standing.daysLeft <= STUCK_TRIAL_DAYS_LEFT && opts.activated === false) return true
      const since = lastSeenAt ?? opts.createdAt ?? null
      if (!since) return false
      return now.getTime() - since.getTime() >= STUCK_NO_LOGIN_DAYS * 86_400_000
    }
    default:
      return false
  }
}

/** Why a clinic is on the band, in the owner's words (the same cases, same order as the predicate). */
export function stuckReason(standing: ClinicStanding, lastSeenAt: Date | null, now: Date, opts: StuckOpts = {}): string | null {
  if (!clinicIsStuck(standing, lastSeenAt, now, opts)) return null
  if (standing.kind === 'walled') return 'The trial ran out with no plan — behind the wall'
  if (standing.kind === 'past_due') return 'A payment failed'
  const d = standing.daysLeft
  if (d != null && d <= STUCK_TRIAL_DAYS_LEFT && opts.activated === false) {
    return d <= 0 ? 'Trial ends today, nothing connected yet' : `Trial ends in ${d} ${d === 1 ? 'day' : 'days'}, nothing connected yet`
  }
  return lastSeenAt ? 'No one has signed in for a week' : 'No one has signed in since it was created'
}
