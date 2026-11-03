import type { Tone } from '@/lib/ui/encodings'
import type { ReadinessFact, ReadinessFactId } from '@/lib/readiness'

/**
 * THE DREAM TEAM's client-safe registry (docs/ai-operations.md). Shared by
 * the Approval Inbox (client), the Overview's summons strip (server), and
 * the /dream-team page — one home so the icons and urgency thresholds can
 * never drift between the strip and the stack it summons you to.
 */

/** Capability → the specialist's glyph, everywhere a card or chip shows one. */
export const CAPABILITY_ICON: Record<string, string> = {
  review_reply: '⭐',
  social_post: '📣',
  inquiry_response: '💬',
  outreach_campaign: '💌',
  gbp_website_fix: '📍',
  setup_hours: '🕒',
  setup_chairs: '🪑',
  setup_booking_mode: '📅',
  setup_texting: '💬',
  content_plan: '🗂️',
  schedule_gap: '🌤️',
  insurance_check: '🛡️',
  // THE GENERATOR LANE (ML-11) — registered ahead of their generators.
  patient_reply: '💬',
  feedback_reply: '📝',
  inquiry_followup: '💬',
  postop_checkin: '🩹',
  post_visit_care: '🩹',
  rebook_nudge: '📅',
  membership_rescue: '💳',
  listing_watch: '📍',
  newsletter: '📰',
  referral_ask: '🤝',
  order_update: '📦',
  consent: '✅',
  setup_team_photo: '📷',
  setup_closures: '🗓️',
}

/** A card about to retire itself deserves a quiet tone mark (never the
 *  brand hue — tones carry meaning). Pure; pinned by tests. */
export function expiryTone(expiresAt: Date | null | undefined, now: Date = new Date()): Tone | null {
  if (!expiresAt) return null
  const ms = expiresAt.getTime() - now.getTime()
  if (ms <= 24 * 60 * 60 * 1000) return 'urgent'
  if (ms <= 72 * 60 * 60 * 1000) return 'warn'
  return null
}

/**
 * The same fact the tone dot encodes, said in WORDS (D7). A coloured dot is
 * not self-labelling, and the one thing a person needs before skipping a
 * card is whether skipping costs them the card. Day-granular and computed
 * in the CLINIC's day (never the server's UTC one — a card expiring at
 * 11 PM Central is still "today" for the practice, not tomorrow).
 *
 * Pure: takes the two day KEYS (YYYY-MM-DD, from `clinicDayKey`) so the
 * caller owns the timezone and this stays testable without one.
 */
export function expiryDayLabel(todayKey: string, expiryKey: string | null): string | null {
  if (!expiryKey) return null
  const a = Date.parse(`${todayKey}T00:00:00Z`)
  const b = Date.parse(`${expiryKey}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  const days = Math.round((b - a) / 86_400_000)
  if (days < 0) return 'Retires today'
  if (days === 0) return 'Retires today'
  if (days === 1) return 'Retires tomorrow'
  if (days <= 6) return `Retires in ${days} days`
  return null
}

/**
 * "CYCLES" (D7d) — how long ago the team last ran, in plain words.
 *
 * The owner named the heartbeat after sleep cycles, and the name has to
 * earn itself: "on the clock" is decoration until a person can see the
 * clock ticking. Coarse on purpose (the pass is hourly, so minute-precision
 * would imply a resolution the machine does not have), and null when there
 * is no stamp yet — the caller says "first cycle within the hour", which is
 * the truth for a clinic whose first pass has not run.
 */
export function cycleLabel(cycleAt: Date | null | undefined, now: Date = new Date()): string | null {
  if (!cycleAt) return null
  const mins = Math.floor((now.getTime() - cycleAt.getTime()) / 60_000)
  // A clock skew or a stamp from the future reads as "just now" rather than
  // "in -3 minutes" — a report must never render arithmetic at a person.
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} minutes ago`
  const hours = Math.floor(mins / 60)
  if (hours === 1) return 'an hour ago'
  if (hours < 24) return `${hours} hours ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

/**
 * THE ROSTER (D3): the presentational grouping of every registered
 * capability into the specialists a clinic meets on /dream-team. Purely a
 * lens over lib/autonomy's CAPABILITIES — membership here changes nothing
 * about behavior, and a capability absent from every specialist simply
 * doesn't appear on the roster (the meta lanes: guardian_note,
 * proposal_engine).
 */
export interface SpecialistDef {
  id: string
  name: string
  icon: string
  /** One warm line — what this teammate does, in the clinic's voice. */
  blurb: string
  capabilities: readonly string[]
}

export const SPECIALISTS: readonly SpecialistDef[] = [
  {
    id: 'front_desk',
    name: 'Front desk',
    icon: '💬',
    blurb: 'Answers inquiries, covers after hours, and opens follow-ups so nothing drops.',
    capabilities: [
      'inquiry_response',
      'auto_reply',
      'scheduled_message',
      'followup_rule',
      // THE GENERATOR LANE (ML-11): answering the people who wrote in, and
      // the courtesy call after a procedure — the desk's own jobs.
      'patient_reply',
      'inquiry_followup',
      'postop_checkin',
      'post_visit_care',
    ],
  },
  {
    id: 'scheduling',
    name: 'Scheduling',
    icon: '📅',
    blurb: 'Reminds, rebooks no-shows, offers freed slots, and fills quiet weeks.',
    capabilities: [
      'appointment_reminder',
      'noshow_rebook',
      // THE GENERATOR LANE (ML-11): the cancelled visit's sibling of the
      // no-show rebook.
      'rebook_nudge',
      'waitlist_offer',
      'schedule_gap',
      'forms_reminder',
    ],
  },
  {
    id: 'reputation',
    name: 'Reputation',
    icon: '⭐',
    blurb: 'Asks happy patients for reviews, drafts your replies, and keeps Google honest.',
    capabilities: [
      'review_request',
      'review_reply',
      'review_feature',
      'nps_survey',
      'gbp_website_fix',
      'listing_sync',
      // THE GENERATOR LANE (ML-11): the listing's watchdog, the private
      // feedback that never reaches Google, and the referral ask — the
      // review request's sibling, same happy patient.
      'listing_watch',
      'feedback_reply',
      'referral_ask',
    ],
  },
  {
    id: 'content',
    name: 'Content & social',
    icon: '📣',
    blurb: 'Writes your posts, articles, and service pages, and keeps them going out.',
    capabilities: [
      'social_post',
      'content_plan',
      'blog_publish',
      'scheduled_social',
      'service_copywriting',
    ],
  },
  {
    id: 'outreach',
    name: 'Patient outreach',
    icon: '💌',
    blurb: 'Runs recall and win-back — the quiet engine that brings patients back.',
    capabilities: [
      'outreach_campaign',
      'retention_automation',
      'campaign_send',
      // THE GENERATOR LANE (ML-11): the monthly newsletter rides the same
      // campaign rails as recall.
      'newsletter',
    ],
  },
  {
    id: 'back_office',
    name: 'Back office',
    icon: '🗂️',
    blurb: 'Chases balances, charges plans on time, looks up benefits, and keeps your systems in step.',
    capabilities: [
      'balance_nudge',
      'payment_autocharge',
      'pms_sync',
      'domain_autorenew',
      'custom_domain',
      'insurance_check',
      // THE GENERATOR LANE (ML-11): the money and the records — a failing
      // membership payment, a shop order's status, and the consent spine.
      'membership_rescue',
      'order_update',
      'consent',
    ],
  },
]

/**
 * WHAT EACH TEAMMATE NEEDS TO START (G1-4). A specialist whose lanes all
 * read from a connection the practice hasn't made yet will report a quiet
 * week forever, and "A quiet week — nothing to report" is then the wrong
 * sentence: the honest one names the missing fact and links to its door.
 * Keyed on the readiness report's fact ids (lib/readiness.ts) so the label
 * and the href are the resolver's own, never a second copy. The front desk
 * needs nothing — the website's forms and the after-hours cover are live
 * from day one.
 */
export const SPECIALIST_NEEDS: Record<string, readonly ReadinessFactId[]> = {
  front_desk: [],
  scheduling: ['patients'],
  reputation: ['gbp'],
  content: ['social'],
  outreach: ['patients'],
  back_office: ['pms'],
}

/**
 * The first fact a specialist is waiting on, or null. A blocker is a fact
 * graded 'todo' (the practice hasn't started it) or 'attention' (it broke).
 * 'waiting' is an external queue the practice already did its part for,
 * and 'ready' / 'na' block nothing. Pure; a null report (unreadable) never
 * produces a blocker — the roster then says a quiet week plainly rather
 * than guessing at a cause.
 */
export function specialistBlocker(
  specialistId: string,
  facts: readonly ReadinessFact[] | null | undefined,
): ReadinessFact | null {
  if (!facts) return null
  const needs = SPECIALIST_NEEDS[specialistId]
  if (!needs || needs.length === 0) return null
  for (const id of needs) {
    const fact = facts.find((f) => f.id === id)
    if (fact && (fact.grade === 'todo' || fact.grade === 'attention')) return fact
  }
  return null
}
