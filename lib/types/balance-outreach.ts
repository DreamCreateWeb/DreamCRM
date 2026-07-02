// Client-safe types + defaults for the automated balance-reminder cadence
// (Shop → Payments → "Automatic balance reminders"). Stored as a single jsonb
// column `clinic_profile.balance_outreach`; null = defaults (DISABLED — money
// emails are strictly opt-in). Same merge-over-defaults pattern as
// resolveReminderSettings.

export interface BalanceOutreachSettings {
  /** Master switch. Default OFF — a clinic explicitly opts into dunning email. */
  enabled: boolean
  /** Only patients owing at least this much get the automated email. */
  minBalanceCents: number
  /** Days between reminder emails for one patient. */
  cadenceDays: number
  /** Most automated reminders per patient inside a rolling 90 days — after
   *  this many, collections is a phone call, not more email. */
  maxSends: number
}

export const BALANCE_OUTREACH_DEFAULTS: BalanceOutreachSettings = {
  enabled: false,
  minBalanceCents: 2500, // $25 — below that the email costs more goodwill than it collects
  cadenceDays: 14,
  maxSends: 3,
}

export const BALANCE_OUTREACH_WINDOW_DAYS = 90

const MIN_BALANCE_FLOOR = 100 // $1
const MIN_BALANCE_CEIL = 1_000_000 // $10k
const CADENCE_MIN_DAYS = 7
const CADENCE_MAX_DAYS = 60
const MAX_SENDS_CEIL = 6

/** Merge a stored (possibly partial / legacy) jsonb value over the defaults;
 *  junk can never poison the column and new knobs never need a backfill. */
export function resolveBalanceOutreachSettings(stored: unknown): BalanceOutreachSettings {
  const d = BALANCE_OUTREACH_DEFAULTS
  if (!stored || typeof stored !== 'object') return { ...d }
  const s = stored as Record<string, unknown>
  const out: BalanceOutreachSettings = { ...d }
  if (typeof s.enabled === 'boolean') out.enabled = s.enabled
  if (typeof s.minBalanceCents === 'number' && Number.isFinite(s.minBalanceCents)) {
    out.minBalanceCents = Math.min(MIN_BALANCE_CEIL, Math.max(MIN_BALANCE_FLOOR, Math.round(s.minBalanceCents)))
  }
  if (typeof s.cadenceDays === 'number' && Number.isFinite(s.cadenceDays)) {
    out.cadenceDays = Math.min(CADENCE_MAX_DAYS, Math.max(CADENCE_MIN_DAYS, Math.round(s.cadenceDays)))
  }
  if (typeof s.maxSends === 'number' && Number.isFinite(s.maxSends)) {
    out.maxSends = Math.min(MAX_SENDS_CEIL, Math.max(1, Math.round(s.maxSends)))
  }
  return out
}
