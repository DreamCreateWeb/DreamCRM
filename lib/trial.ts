/**
 * Free-trial logic — the single source of truth for "is this clinic on a trial
 * / has it expired / how many days are left / does it still owe us a card".
 * PURE + client-safe (no `server-only`, no DB): `getTenantContext` feeds it the
 * clinic_profile billing fields it already loads, and the banner/wall render
 * from the result.
 *
 * THE MODEL (owner ruling 2026-11-23, replacing the 2026-06-16 no-card week):
 * a practice that signs up gets a 14-day free trial that STARTS WHEN IT ADDS A
 * CARD. Three kinds of clinic pass through here:
 *
 *   1. SIGNED UP, NO CARD YET — `subscription_status = 'awaiting_card'`, no
 *      Stripe subscription, no `trial_ends_at`. Nothing has started: the
 *      dashboard shows the card step (`needsCard`), and every gate that asks
 *      `expired` treats the clinic as closed, so no engine, public site or AI
 *      spend runs for an account that never finished signing up.
 *
 *   2. A CARD-ON-FILE TRIAL — Stripe Checkout created a subscription with
 *      `trial_period_days`, so Stripe reports `trialing` and we hold its id.
 *      STRIPE OWNS THIS CLOCK. `trial_ends_at` mirrors Stripe's `trial_end`
 *      for display, but running past it locally never walls the clinic: at
 *      that instant Stripe is turning the trial into a paid subscription and
 *      the webhook that says so is seconds (or, on a bad day, hours) behind.
 *      Walling on our clock would dark a paying practice's website on the
 *      strength of a late webhook. The subscription leaves this state only
 *      when Stripe says so — `active`, `past_due`, or deleted.
 *
 *   3. A NO-CARD TRIAL — `trial_ends_at` set, no Stripe subscription. This is
 *      how every clinic started before the ruling and how a clinic the
 *      platform provisions by hand still starts (the owner activates a
 *      reserved plan later). OUR clock: on expiry without a paid subscription
 *      the clinic is locked to the billing wall.
 *
 *   - A real PAID subscription always wins over all three: once
 *     `stripeSubscriptionId` is set and the status is active/past_due, the
 *     trial fields are ignored (no banner, no lock).
 *   - `trial_ends_at == null` with no awaiting-card status means "never on a
 *     trial" — comped clinics, the demo, and any legacy row. Never gated.
 */

/** Length of the free trial, in days. */
export const TRIAL_DAYS = 14

/**
 * `clinic_profile.subscription_status` for a self-serve signup that has not
 * added a card. OURS, not one of Stripe's statuses: Stripe has never heard of
 * this clinic. The first subscription sync overwrites it with Stripe's own.
 */
export const AWAITING_CARD_STATUS = 'awaiting_card'

const DAY_MS = 24 * 60 * 60 * 1000

/** The billing fields the trial logic needs (a subset of clinic_profile). */
export interface TrialInput {
  trialEndsAt: Date | null
  subscriptionStatus: string | null
  stripeSubscriptionId: string | null
}

export interface TrialState {
  /** On an active trial right now (full access). */
  onTrial: boolean
  /** Closed: a no-card trial that ran out, or a signup that never added a
   *  card (`needsCard`). Every gate — the wall, the public site, the engines
   *  — asks this one flag. */
  expired: boolean
  /** The trial end instant, when one is set (for display). */
  trialEndsAt: Date | null
  /** Whole days remaining (ceil, never negative) while `onTrial`; else null.
   *  A no-card trial that ran out reads 0. */
  daysLeft: number | null
  /** Signed up but no card yet — the trial has not started. Always comes
   *  with `expired`, and is what tells the wall to say "start your trial"
   *  rather than "your trial has ended". */
  needsCard: boolean
  /** The trial is a Stripe subscription with a card on file: it becomes a
   *  paid subscription by itself, so there is nothing to nag about and one
   *  date to be honest about. Always comes with `onTrial`. */
  cardOnFile: boolean
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

/**
 * A Stripe subscription in its trial period: we hold its id and Stripe says
 * `trialing`. The card is on file and Stripe converts it on its own clock.
 * (A NO-card trial also carries 'trialing' in the column — signup and
 * provisioning used to write it — which is why the subscription id is the
 * half that decides.)
 */
export function hasCardOnFileTrial(input: Pick<TrialInput, 'subscriptionStatus' | 'stripeSubscriptionId'>): boolean {
  return Boolean(input.stripeSubscriptionId) && input.subscriptionStatus === 'trialing'
}

const NOT_GATED = { onTrial: false, expired: false, daysLeft: null, needsCard: false, cardOnFile: false } as const

/** Resolve the trial state for a clinic. Pure + deterministic. */
export function resolveTrialState(input: TrialInput, now: Date = new Date()): TrialState {
  const trialEndsAt = input.trialEndsAt ?? null
  // A paid subscription is never trial-gated, whatever the trial fields say.
  if (hasPaidSubscription(input)) return { ...NOT_GATED, trialEndsAt }
  // Stripe's clock, not ours (see the header): never `expired` from here.
  if (hasCardOnFileTrial(input)) {
    return {
      onTrial: true,
      expired: false,
      trialEndsAt,
      daysLeft: trialDaysLeft(trialEndsAt, now),
      needsCard: false,
      cardOnFile: true,
    }
  }
  // Signed up, never added a card: closed, and not a trial that "ended".
  if (input.subscriptionStatus === AWAITING_CARD_STATUS) {
    return { onTrial: false, expired: true, trialEndsAt: null, daysLeft: null, needsCard: true, cardOnFile: false }
  }
  // Never put on a trial (comped, the demo, legacy rows).
  if (!trialEndsAt) return { ...NOT_GATED, trialEndsAt: null }
  const remainingMs = trialEndsAt.getTime() - now.getTime()
  if (remainingMs > 0) {
    return {
      onTrial: true,
      expired: false,
      trialEndsAt,
      daysLeft: Math.max(0, Math.ceil(remainingMs / DAY_MS)),
      needsCard: false,
      cardOnFile: false,
    }
  }
  return { onTrial: false, expired: true, trialEndsAt, daysLeft: 0, needsCard: false, cardOnFile: false }
}

/**
 * How many trial days THIS clinic's Checkout starts with — or null for none.
 *
 * Only a signup that has not added its card gets them. Every other clinic
 * that reaches Checkout is charged the moment it completes: a no-card trial
 * choosing a plan (it already had its free weeks), a clinic resubscribing
 * after a cancel (one trial per clinic — the status it carries by then is
 * Stripe's 'canceled', never ours), a hand-provisioned clinic activating.
 * Pure, so the rule about who is charged today is a table a test can read.
 */
export function trialDaysAtCheckout(subscriptionStatus: string | null | undefined): number | null {
  return subscriptionStatus === AWAITING_CARD_STATUS ? TRIAL_DAYS : null
}

/** The trial end instant for a NO-card trial starting now (platform
 *  provisioning). A self-serve signup has no end date until it adds a card,
 *  and then the date is Stripe's. */
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

/**
 * Escalating urgency bucket as the trial winds down — the single knob that
 * drives the banner's + the reminder modal's colour and copy so they can't
 * drift apart:
 *   calm   4+ days  (violet, low pressure)
 *   soon   2–3 days (amber)
 *   urgent 1 day    (orange)
 *   final  today    (rose — last chance before the lock wall)
 */
export type TrialUrgency = 'calm' | 'soon' | 'urgent' | 'final'

export function trialUrgency(daysLeft: number | null): TrialUrgency {
  if (daysLeft == null) return 'calm'
  if (daysLeft <= 0) return 'final'
  if (daysLeft <= 1) return 'urgent'
  if (daysLeft <= 3) return 'soon'
  return 'calm'
}

/** A short, escalating headline for the trial nudge (banner + modal). */
export function trialHeadline(daysLeft: number | null): string {
  switch (trialUrgency(daysLeft)) {
    case 'final':
      return 'Your free trial ends today'
    case 'urgent':
      return 'Your free trial ends tomorrow'
    case 'soon':
      return `Only ${daysLeft} days left in your free trial`
    default:
      return `${daysLeft} days left in your free trial`
  }
}

/** The escalating supporting line — what's at stake + the action to take. */
export function trialSubline(daysLeft: number | null): string {
  switch (trialUrgency(daysLeft)) {
    case 'final':
      return "Add a payment method and choose a plan now to keep your website, patients, and everything you've set up."
    case 'urgent':
      return "Add a card and choose a plan before tomorrow so you don't lose access to your site and patients."
    case 'soon':
      return 'Add a payment method and choose a plan to keep full access when the trial ends.'
    default:
      return "You have full access with no card on file. Pick a plan whenever you're ready — it locks in your price."
  }
}

/**
 * The one line a trial WITH A CARD ON FILE needs to say, wherever it is said
 * (the banner, Settings). There is nothing to do and one fact to know, so it
 * never escalates the way the no-card copy above does.
 */
export function cardOnFileTrialLine(daysLeft: number | null): string {
  if (daysLeft == null) return 'Your free trial is running — your card is charged when it ends.'
  if (daysLeft <= 0) return 'Your free trial ends today — your card is charged when it does.'
  if (daysLeft === 1) return 'Your free trial ends tomorrow — your card is charged then.'
  return `${daysLeft} days left in your free trial — your card is charged when it ends.`
}

/**
 * Which trial-reminder EMAIL is due. Returns the milestone key the cron should
 * send right now given the days left and what's already been sent — or null
 * when nothing is due. Idempotent by design: the caller records each sent key
 * so a re-run skips it.
 *
 * Two schedules, because the two trials need opposite things said:
 *
 *  - `no_card` (the default): 'd3' (2–3 days out), 'd1' (the final day —
 *    `daysLeft` is `ceil`, so it reads 1 for the whole last day and then flips
 *    straight to expired), 'ended' (expired). Each asks for a card.
 *  - `card_on_file`: 'd7' (4–7 days out) and 'd1'. Each says WHEN THE CARD IS
 *    CHARGED and how to cancel first — the notice a card-on-file trial owes
 *    its customer before it bills. Never 'ended': that trial does not end, it
 *    becomes a subscription, and Stripe's receipt says so.
 *  - `needs_card`: nothing. A signup that never added a card has no trial to
 *    be reminded about; "your free trial has ended" would be false.
 */
export type TrialReminderMilestone = 'd7' | 'd3' | 'd1' | 'ended'
export type TrialReminderKind = 'no_card' | 'card_on_file' | 'needs_card'

/** Which reminder schedule a resolved trial state is on. */
export function trialReminderKind(state: Pick<TrialState, 'needsCard' | 'cardOnFile'>): TrialReminderKind {
  if (state.needsCard) return 'needs_card'
  return state.cardOnFile ? 'card_on_file' : 'no_card'
}

export function dueTrialReminder(
  daysLeft: number | null,
  expired: boolean,
  alreadySent: readonly string[],
  kind: TrialReminderKind = 'no_card',
): TrialReminderMilestone | null {
  if (kind === 'needs_card') return null
  const sent = new Set(alreadySent)
  if (kind === 'card_on_file') {
    if (expired || daysLeft == null) return null
    if (daysLeft <= 1) return sent.has('d1') ? null : 'd1'
    if (daysLeft <= 7) return sent.has('d7') ? null : 'd7'
    return null
  }
  if (expired) return sent.has('ended') ? null : 'ended'
  if (daysLeft == null) return null
  if (daysLeft <= 1) return sent.has('d1') ? null : 'd1'
  if (daysLeft <= 3) return sent.has('d3') ? null : 'd3'
  return null
}
