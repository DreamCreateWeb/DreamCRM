/**
 * Date / birthday helpers shared across the Daily services (patients,
 * appointments, clinic-overview). Pure + deterministic — the reference
 * `today`/`now` is passed in so the same DOB resolves identically on every
 * surface (these were previously copy-pasted per service and had begun to
 * drift). Local times, matching the existing dashboards' wall-clock semantics.
 */

export function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export function endOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}

export function startOfWeek(d: Date): Date {
  const r = startOfDay(d)
  r.setDate(r.getDate() - r.getDay()) // 0 = Sunday
  return r
}

export function startOfMonth(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), 1)
  r.setHours(0, 0, 0, 0)
  return r
}

export function endOfMonth(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  r.setHours(23, 59, 59, 999)
  return r
}

/** Default months without a visit before a patient is considered lapsed (💤 +
 *  lifecycle='lapsed'). 18 is the proactive dental-industry standard (the ADA's
 *  hard "inactive" line is 24mo; recall is ~6mo) — clinics can override per
 *  practice via clinic_profile.lapsed_after_months. */
export const LAPSED_DEFAULT_MONTHS = 18

/** The cutoff date before which a last-visit counts as lapsed, for a clinic's
 *  configured months (null/0 → the default). ~30-day months, matching the prior
 *  heuristic. */
export function lapsedCutoff(now: Date, months: number | null | undefined): Date {
  const m = months && months > 0 ? months : LAPSED_DEFAULT_MONTHS
  return new Date(now.getTime() - m * 30 * 24 * 60 * 60 * 1000)
}

const DOB_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Whole years from a `YYYY-MM-DD` DOB (null when absent/malformed). */
export function ageFromDob(dob: string | null, today: Date = new Date()): number | null {
  if (!dob) return null
  const m = DOB_RE.exec(dob)
  if (!m) return null
  const birth = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  let years = today.getFullYear() - birth.getFullYear()
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  if (beforeBirthday) years -= 1
  return years
}

/**
 * Birthdays are compared against a CALENDAR DAY, never a server instant: the
 * prod clock is UTC, so from ~7 PM Central the server's "today" is already
 * tomorrow and at month end its "this month" is next month — a greeting a
 * day early, a birthday call list wrong for the evening shift (CLAUDE.md
 * timezone rule 2). Callers pass the clinic-local `YYYY-MM-DD` key
 * (`clinicDayKey(now, tz)`); these helpers never touch the wall clock.
 */
const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** `YYYY-MM-DD` + `days` as a UTC calendar date (timezone-free arithmetic). */
function dayKeyToUtc(dayKey: string): Date | null {
  const m = DAY_KEY_RE.exec(dayKey)
  if (!m) return null
  return new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)))
}

/** True when the patient's birthday falls within today..today+`days` on the
 *  clinic's calendar (handles the Dec→Jan year rollover). */
export function isBirthdayWithinDays(dob: string | null, todayKey: string, days: number): boolean {
  if (!dob) return false
  const m = DOB_RE.exec(dob)
  if (!m) return false
  const today = dayKeyToUtc(todayKey)
  if (!today) return false
  const month = parseInt(m[2], 10) - 1
  const day = parseInt(m[3], 10)
  const candidate = new Date(Date.UTC(today.getUTCFullYear(), month, day))
  if (candidate < today) candidate.setUTCFullYear(today.getUTCFullYear() + 1)
  const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days))
  return candidate >= today && candidate <= last
}

/** True when the patient's birthday falls within today..today+6 on the
 *  clinic's calendar. Drives the 🎂 glyph. */
export function isBirthdayThisWeek(dob: string | null, todayKey: string): boolean {
  return isBirthdayWithinDays(dob, todayKey, 6)
}

/** The clinic-local month as the two-digit `MM` a `YYYY-MM-DD` DOB column
 *  carries — the SQL month predicate's operand. Empty for a malformed key. */
export function birthdayMonthOf(todayKey: string): string {
  const m = DAY_KEY_RE.exec(todayKey)
  return m ? m[2] : ''
}

/** True when the patient's birthday month is the clinic's current month. */
export function isBirthdayThisMonth(dob: string | null, todayKey: string): boolean {
  if (!dob) return false
  const m = DOB_RE.exec(dob)
  if (!m) return false
  const month = birthdayMonthOf(todayKey)
  return month !== '' && m[2] === month
}
