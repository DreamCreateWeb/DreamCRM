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
   * The reminder JOURNEY: hours before the visit for each touch, unique +
   * descending, 1–{REMINDER_MAX_TOUCHES} entries. Default [72, 24] — a
   * 3-days-out heads-up plus the day-before nudge (the multi-touch cadence
   * every major vendor ships). Legacy blobs that stored a single
   * `offsetHours` resolve to a one-touch journey, preserving the clinic's
   * chosen timing exactly.
   */
  touchOffsets: number[]
  /**
   * Nudge patients with an upcoming visit who haven't completed their intake
   * forms (within FORMS_REMINDER_WINDOW_HOURS). Default ON. Only fires for LIVE
   * appointments (cancelled/no-show/completed never get one) and stops once the
   * patient submits a form.
   */
  formsReminder: boolean
}

export const REMINDER_DEFAULTS: ReminderSettings = {
  enabled: true,
  touchOffsets: [72, 24],
  formsReminder: true,
}

/** How far ahead a forms-completion reminder looks for an unfinished intake. */
export const FORMS_REMINDER_WINDOW_HOURS = 48

/** Inclusive bounds for each touch offset, shared by resolver + settings UI. */
export const REMINDER_OFFSET_MIN_HOURS = 4
export const REMINDER_OFFSET_MAX_HOURS = 168 // 7 days

/** Most touches a journey can carry — more than 3 emails is spam, not care. */
export const REMINDER_MAX_TOUCHES = 3

/**
 * Minimum gap between reminder emails for one appointment. Keeps a
 * booked-yesterday-for-tomorrow visit from getting the 72h touch and the 24h
 * touch back-to-back, and lets a manual drawer send suppress the next
 * automated touch instead of stacking on it.
 */
export const REMINDER_MIN_GAP_HOURS = 20

/** One-click journey presets for the settings UI. */
export const REMINDER_JOURNEY_PRESETS: Array<{ label: string; offsets: number[] }> = [
  { label: '3 days + day before', offsets: [72, 24] },
  { label: '1 week + 3 days + day before', offsets: [168, 72, 24] },
  { label: 'Day before only', offsets: [24] },
]

/** The reminder-log template key for a journey touch ("auto_reminder_72h").
 *  Per-touch idempotency keys on it — each touch sends at most once, ever. */
export function reminderTouchTemplate(offsetHours: number): string {
  return `auto_reminder_${offsetHours}h`
}

function clampOffset(v: number): number {
  return Math.min(REMINDER_OFFSET_MAX_HOURS, Math.max(REMINDER_OFFSET_MIN_HOURS, Math.round(v)))
}

/** Clean a touch list: clamp each, de-dupe, sort DESC, cap the count. Returns
 *  null when nothing usable survives (caller falls back to the default). */
export function cleanTouchOffsets(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  const cleaned = raw
    .map((v) => (typeof v === 'number' && Number.isFinite(v) ? clampOffset(v) : null))
    .filter((v): v is number => v !== null)
  const unique = Array.from(new Set(cleaned)).sort((a, b) => b - a).slice(0, REMINDER_MAX_TOUCHES)
  return unique.length > 0 ? unique : null
}

/**
 * Merge a stored (possibly partial / legacy) jsonb value over the defaults.
 * Unknown keys are dropped; missing or malformed keys inherit the default — so
 * a junk payload can never poison the column and a new setting never needs a
 * backfill. Legacy `offsetHours` (the pre-journey single offset) resolves to a
 * one-touch journey so an existing clinic's timing is preserved verbatim.
 */
export function resolveReminderSettings(stored: unknown): ReminderSettings {
  const d = REMINDER_DEFAULTS
  if (!stored || typeof stored !== 'object') return { ...d, touchOffsets: [...d.touchOffsets] }
  const s = stored as Record<string, unknown>

  const out: ReminderSettings = { ...d, touchOffsets: [...d.touchOffsets] }
  if (typeof s.enabled === 'boolean') out.enabled = s.enabled
  if (typeof s.formsReminder === 'boolean') out.formsReminder = s.formsReminder

  const touches = cleanTouchOffsets(s.touchOffsets)
  if (touches) {
    out.touchOffsets = touches
  } else if (typeof s.offsetHours === 'number' && Number.isFinite(s.offsetHours)) {
    // Legacy single-offset blob → one-touch journey at exactly that offset.
    out.touchOffsets = [clampOffset(s.offsetHours)]
  }
  return out
}
