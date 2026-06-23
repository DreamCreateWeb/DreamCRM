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

/** Lapsed = last visit older than ~9 months. Drives the 💤 glyph + the
 *  `lifecycle = 'lapsed'` denormalization across Patients + Appointments. */
export const LAPSED_THRESHOLD_MS = 9 * 30 * 24 * 60 * 60 * 1000 // ~9 months

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

/** True when the patient's birthday falls within today..today+6 (handles the
 *  Dec→Jan year rollover). Drives the 🎂 glyph. */
export function isBirthdayThisWeek(dob: string | null, today: Date): boolean {
  if (!dob) return false
  const m = DOB_RE.exec(dob)
  if (!m) return false
  const month = parseInt(m[2], 10) - 1
  const day = parseInt(m[3], 10)
  const candidate = new Date(today.getFullYear(), month, day)
  if (candidate < startOfDay(today)) candidate.setFullYear(today.getFullYear() + 1)
  const sixOut = new Date(today)
  sixOut.setDate(sixOut.getDate() + 6)
  return candidate >= startOfDay(today) && candidate <= sixOut
}

/** True when the patient's birthday month is the current month. */
export function isBirthdayThisMonth(dob: string | null, today: Date): boolean {
  if (!dob) return false
  const m = DOB_RE.exec(dob)
  if (!m) return false
  return parseInt(m[2], 10) - 1 === today.getMonth()
}
