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
