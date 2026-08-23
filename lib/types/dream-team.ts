import type { Tone } from '@/lib/ui/encodings'

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
    capabilities: ['inquiry_response', 'auto_reply', 'scheduled_message', 'followup_rule'],
  },
  {
    id: 'scheduling',
    name: 'Scheduling',
    icon: '📅',
    blurb: 'Reminds, rebooks no-shows, offers freed slots, and fills quiet weeks.',
    capabilities: [
      'appointment_reminder',
      'noshow_rebook',
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
    capabilities: ['outreach_campaign', 'retention_automation', 'campaign_send'],
  },
  {
    id: 'back_office',
    name: 'Back office',
    icon: '🗂️',
    blurb: 'Chases balances, charges plans on time, and keeps your systems in step.',
    capabilities: ['balance_nudge', 'payment_autocharge', 'pms_sync', 'domain_autorenew'],
  },
]
