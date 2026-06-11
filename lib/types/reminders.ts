// Client-safe types + defaults for automated appointment reminders.
//
// Stored as a single jsonb column `clinic_profile.reminder_settings`; null =
// REMINDER_DEFAULTS. Same merge-over-defaults pattern as resolvePortalSettings
// (lib/types/portal.ts) — a partial / legacy stored blob merges over the
// defaults on read, so adding a new knob never needs a backfill.
//
// The public booking form + confirmation email PROMISE patients an automatic
// reminder; this is the contract that makes that true. Engine lives in
// lib/services/reminder-automation.ts; cron at /api/cron/send-reminders.

export interface ReminderSettings {
  /** Master switch. Default ON — a fresh clinic gets reminders without setup,
   *  matching what the booking confirmation email already tells patients. */
  enabled: boolean
  /**
   * How many hours BEFORE the appointment the reminder goes out. The engine
   * sends to any qualifying appointment whose start falls within
   * [now, now + offsetHours]. Default 24h (the dental-industry norm + what the
   * appointment drawer's manual reminder copy implies). Clamped 4–168 on read.
   */
  offsetHours: number
}

export const REMINDER_DEFAULTS: ReminderSettings = {
  enabled: true,
  offsetHours: 24,
}

/** Inclusive bounds for the offset, shared by the resolver + the settings form. */
export const REMINDER_OFFSET_MIN_HOURS = 4
export const REMINDER_OFFSET_MAX_HOURS = 168 // 7 days

/**
 * Merge a stored (possibly partial / legacy) jsonb value over the defaults.
 * Unknown keys are dropped; missing or malformed keys inherit the default — so
 * a junk payload can never poison the column and a new setting never needs a
 * backfill. offsetHours is clamped to the [MIN, MAX] window.
 */
export function resolveReminderSettings(stored: unknown): ReminderSettings {
  const d = REMINDER_DEFAULTS
  if (!stored || typeof stored !== 'object') return { ...d }
  const s = stored as Record<string, unknown>

  const out: ReminderSettings = { ...d }
  if (typeof s.enabled === 'boolean') out.enabled = s.enabled
  if (typeof s.offsetHours === 'number' && Number.isFinite(s.offsetHours)) {
    out.offsetHours = Math.min(
      REMINDER_OFFSET_MAX_HOURS,
      Math.max(REMINDER_OFFSET_MIN_HOURS, Math.round(s.offsetHours)),
    )
  }
  return out
}
