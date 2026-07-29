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
  // THE GUARDIAN's clinic-facing note (Phase 4). Auto-by-default because it
  // only ever REPORTS — it writes a ledger line in the clinic's own voice
  // and sends nothing to a patient. It is deliberately NOT grantable: there
  // is no judgment to hand over, and the audience lock that governs whether
  // it speaks at all lives with the platform owner, not the clinic.
  { key: 'guardian_note', label: 'Tell you when something needs a look', defaultTrust: 'auto' },
  // THE PROPOSAL ENGINE itself (Phase 4 observability). Not a job the clinic
  // grants — it is how every ask-first job REACHES them. It earns a key so
  // that "I couldn't bring you any work at all today" has somewhere honest
  // to be written; without it, the engine dying is the one failure nobody
  // can see, because a clinic with an empty inbox looks exactly like a
  // clinic with nothing to do.
  { key: 'proposal_engine', label: 'Bring you work that’s ready to approve', defaultTrust: 'auto' },
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
 * The capabilities a clinic can hand over from a card (Phase 3 — "always
 * do this for me"): exactly the proposal-backed, ask-by-default four. The
 * auto-by-default capabilities are managed by their own feature switches
 * (reminders, review requests, …), never through the ladder's grant flow —
 * and nothing outside this list may ever be granted 'auto' via the ladder,
 * so a typo'd or not-yet-registered capability can't be switched to acting
 * on its own by accident.
 */
export const GRANTABLE_CAPABILITIES = [
  'review_reply',
  'social_post',
  'inquiry_response',
  'outreach_campaign',
] as const

export function isGrantable(key: string): boolean {
  return (GRANTABLE_CAPABILITIES as readonly string[]).includes(key)
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

/**
 * WHEN the grant was given. Stored beside the levels under a reserved key
 * (never a capability name, so resolveTrust and every GRANTABLE-driven
 * reader ignore it). "From now on, handle these for me" is a promise about
 * the FUTURE: work already sitting in the inbox — the 1-star review the
 * clinic parked while deciding what to say — was never part of the yes, so
 * the machine only acts on cards filed at or after this instant
 * (round-2 Phase-3 audit).
 *
 * null means an older grant with no stamp: those keep the original
 * everything-open behavior rather than silently freezing.
 */
export const GRANTED_AT_KEY = '_grantedAt'

/**
 * WHEN the clinic last took this capability BACK. A revoke is the strongest
 * "no" the ladder can receive — stronger than the decline the earned-trust
 * run already honors — so the run that suggests handing the job over counts
 * only decisions made SINCE it. Without this, revoking was answered by the
 * very next card asking for the grant back, citing approvals the clinic had
 * already overruled (round-3 audit).
 */
export const REVOKED_AT_KEY = '_revokedAt'

function resolveStamp(stored: unknown, key: string, capability: string): Date | null {
  if (!stored || typeof stored !== 'object') return null
  const map = (stored as Record<string, unknown>)[key]
  if (!map || typeof map !== 'object') return null
  const raw = (map as Record<string, unknown>)[capability]
  if (typeof raw !== 'string') return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function resolveGrantedAt(stored: unknown, capability: string): Date | null {
  return resolveStamp(stored, GRANTED_AT_KEY, capability)
}

export function resolveRevokedAt(stored: unknown, capability: string): Date | null {
  return resolveStamp(stored, REVOKED_AT_KEY, capability)
}
