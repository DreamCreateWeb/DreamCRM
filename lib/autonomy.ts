/**
 * THE AUTONOMY LADDER (Transformation Phase 1 — DESIGN.md "The North Star").
 * Pure + client-safe: the capability registry and the trust resolver.
 *
 * Every machine capability has a trust level per clinic:
 *
 *   'ask'  — the machine files a PROPOSAL and waits for a human yes
 *   'auto' — the machine acts on its own and reports in the ledger
 *
 * Rules (the ladder's law):
 *  - Every capability's DEFAULT encodes exactly today's shipped behavior —
 *    introducing the ladder changed nothing overnight.
 *  - New capabilities ship at 'ask'. Nothing ever grants itself autonomy;
 *    trust is granted by humans ("always do this for me") and is reversible.
 *  - The stored overrides live in clinic_profile.autonomy (jsonb,
 *    capability → level); missing keys fall back to the registry default.
 */

export type TrustLevel = 'ask' | 'auto'

export interface CapabilityDef {
  key: string
  /** Reader-facing name, narrator-voiced. */
  label: string
  /** Today's shipped behavior — the migration-safe default. */
  defaultTrust: TrustLevel
}

/**
 * The machine's capabilities. Keys are also the Action Ledger's `capability`
 * values — one vocabulary across trust, ledger, and (Phase 2) proposals.
 */
export const CAPABILITIES: readonly CapabilityDef[] = [
  // Already-autonomous today (they send on their own and log):
  { key: 'appointment_reminder', label: 'Send appointment reminders', defaultTrust: 'auto' },
  { key: 'review_request', label: 'Ask happy patients for reviews', defaultTrust: 'auto' },
  { key: 'campaign_send', label: 'Send scheduled campaigns', defaultTrust: 'auto' },
  { key: 'retention_automation', label: 'Send recall & win-back nudges', defaultTrust: 'auto' },
  { key: 'followup_rule', label: 'Open follow-ups from smart rules', defaultTrust: 'auto' },
  { key: 'balance_nudge', label: 'Send balance reminders', defaultTrust: 'auto' },
  { key: 'auto_reply', label: 'Send the after-hours auto-reply', defaultTrust: 'auto' },
  { key: 'forms_reminder', label: 'Nudge patients to finish their forms', defaultTrust: 'auto' },
  { key: 'nps_survey', label: 'Ask patients how the visit went', defaultTrust: 'auto' },
  { key: 'noshow_rebook', label: 'Invite no-shows back for a new time', defaultTrust: 'auto' },
  { key: 'waitlist_offer', label: 'Offer freed slots to the waitlist', defaultTrust: 'auto' },
  { key: 'payment_autocharge', label: 'Charge payment-plan installments', defaultTrust: 'auto' },
  { key: 'service_copywriting', label: 'Write your website’s service pages', defaultTrust: 'auto' },
  { key: 'scheduled_message', label: 'Deliver messages scheduled for later', defaultTrust: 'auto' },
  { key: 'blog_publish', label: 'Publish blog posts on schedule', defaultTrust: 'auto' },
  { key: 'scheduled_social', label: 'Queue social posts to publish later', defaultTrust: 'auto' },
  { key: 'domain_autorenew', label: 'Renew your web address each year', defaultTrust: 'auto' },
  { key: 'listing_sync', label: 'Keep your site matching your Google listing', defaultTrust: 'auto' },
  { key: 'review_feature', label: 'Feature new reviews on your website', defaultTrust: 'auto' },
  // Ask-first today (drafts that wait for a human):
  { key: 'review_reply', label: 'Reply to Google reviews', defaultTrust: 'ask' },
  { key: 'social_post', label: 'Publish social & Google posts', defaultTrust: 'ask' },
  { key: 'inquiry_response', label: 'Answer website inquiries', defaultTrust: 'ask' },
  { key: 'outreach_campaign', label: 'Launch outreach campaigns', defaultTrust: 'ask' },
] as const

const BY_KEY: ReadonlyMap<string, CapabilityDef> = new Map(CAPABILITIES.map((c) => [c.key, c]))

export function getCapability(key: string): CapabilityDef | null {
  return BY_KEY.get(key) ?? null
}

/**
 * Resolve a clinic's trust level for a capability from the stored overrides
 * (clinic_profile.autonomy). With no stored grant, unknown capabilities
 * resolve 'ask' — the safe floor for anything not yet registered. An explicit
 * stored human grant is honored FIRST, even for a capability the registry
 * doesn't know yet (by design, round-1 audit: a human's "always do this" for
 * a not-yet-registered capability survives the registration lag) — so this
 * floor is a default, NOT a hard safety invariant.
 */
export function resolveTrust(stored: unknown, capability: string): TrustLevel {
  const def = BY_KEY.get(capability)
  const fallback: TrustLevel = def?.defaultTrust ?? 'ask'
  if (!stored || typeof stored !== 'object') return fallback
  const v = (stored as Record<string, unknown>)[capability]
  return v === 'ask' || v === 'auto' ? v : fallback
}
