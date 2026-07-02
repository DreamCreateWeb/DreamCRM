/**
 * Clinic timezone helpers (pure — no DB, no server-only). The prod server runs
 * in UTC, so any rendering of clinic wall-clock time (booking slot grid,
 * appointment-email times) must resolve against the clinic's IANA timezone,
 * not the server's. Stored on `clinic_profile.timezone`; this is the fallback.
 */

/** Default when a clinic hasn't set one. Matches the PMS default; US dental
 *  skews Eastern. Clinics change it in Settings → Clinic Profile. */
export const CLINIC_DEFAULT_TZ = 'America/New_York'

/** The US IANA zones offered in the settings picker (covers ~all US clinics). */
export const US_TIMEZONES: Array<{ id: string; label: string }> = [
  { id: 'America/New_York', label: 'Eastern (New York)' },
  { id: 'America/Chicago', label: 'Central (Chicago)' },
  { id: 'America/Denver', label: 'Mountain (Denver)' },
  { id: 'America/Phoenix', label: 'Mountain — no DST (Phoenix)' },
  { id: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { id: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { id: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
]

/** Resolve a possibly-null stored timezone to a usable IANA id. */
export function resolveClinicTimeZone(tz: string | null | undefined): string {
  return tz?.trim() || CLINIC_DEFAULT_TZ
}

// ---------------------------------------------------------------------------
// Clinic-local day boundaries. The prod server runs in UTC, so `startOfDay(new
// Date())` is the UTC day — a 7:30 PM Central visit is already "tomorrow" in
// UTC and falls out of a UTC-bounded "today" window. Anything that windows or
// buckets by calendar day for a clinic must use these instead. Pure + DST-aware
// (same two-pass offset technique as lib/services/pms/datetime.ts).
// ---------------------------------------------------------------------------

function zonedParts(instant: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const map: Record<string, string> = {}
  for (const p of dtf.formatToParts(instant)) if (p.type !== 'literal') map[p.type] = p.value
  return {
    y: +map.year,
    mo: +map.month,
    d: +map.day,
    h: +(map.hour === '24' ? '0' : map.hour),
    mi: +map.minute,
    s: +map.second,
  }
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function offsetMs(instant: Date, timeZone: string): number {
  const w = zonedParts(instant, timeZone)
  const asUTC = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s)
  return asUTC - instant.getTime()
}

/** A wall-clock midnight Y/M/D in `timeZone` → the absolute instant. */
function zonedMidnightToUtc(y: number, mo: number, d: number, timeZone: string): Date {
  const naiveUTC = Date.UTC(y, mo - 1, d, 0, 0, 0)
  // Two passes resolve DST boundaries correctly.
  let off = offsetMs(new Date(naiveUTC), timeZone)
  off = offsetMs(new Date(naiveUTC - off), timeZone)
  return new Date(naiveUTC - off)
}

/**
 * The absolute instant of the clinic-local midnight `dayOffset` days from the
 * day containing `now` (0 = today's local midnight, 1 = tomorrow's, -30 = 30
 * local days back). The clinic-correct replacement for `startOfDay(now)`.
 */
export function clinicDayStart(now: Date, timeZone: string | null | undefined, dayOffset = 0): Date {
  const tz = resolveClinicTimeZone(timeZone)
  const w = zonedParts(now, tz)
  // Date.UTC normalizes day overflow/underflow, so offsets cross month/year.
  const shifted = new Date(Date.UTC(w.y, w.mo - 1, w.d + dayOffset))
  return zonedMidnightToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), tz)
}

/** Clinic-local start of the week (Sunday midnight) containing `now`. */
export function clinicWeekStart(now: Date, timeZone: string | null | undefined): Date {
  const tz = resolveClinicTimeZone(timeZone)
  const w = zonedParts(now, tz)
  const weekday = new Date(Date.UTC(w.y, w.mo - 1, w.d)).getUTCDay() // calendar-date weekday
  return clinicDayStart(now, tz, -weekday)
}

/** Clinic-local first-of-month midnight, `monthOffset` months from `now`'s month. */
export function clinicMonthStart(now: Date, timeZone: string | null | undefined, monthOffset = 0): Date {
  const tz = resolveClinicTimeZone(timeZone)
  const w = zonedParts(now, tz)
  const shifted = new Date(Date.UTC(w.y, w.mo - 1 + monthOffset, 1))
  return zonedMidnightToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1, tz)
}

/** Day-of-week (0=Sun … 6=Sat) for a `YYYY-MM-DD` calendar date. Built as a UTC
 *  date so it's timezone-independent — a calendar date has one weekday. */
export function dayOfWeekForDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export type ClinicHours = Record<string, { open?: string | null; close?: string | null; closed?: boolean }>

/**
 * Is the clinic open at `now`, evaluated in its own timezone? Pure — resolves
 * the clinic-local weekday + wall-clock against the day's open/close window
 * ("HH:MM"). A day with no/closed entry, or missing open/close, reads CLOSED.
 * Used to gate the after-hours auto-reply. Defensive against a null hours blob.
 */
export function isWithinOfficeHours(
  hours: ClinicHours | null | undefined,
  timeZone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!hours || typeof hours !== 'object') return false
  const tz = resolveClinicTimeZone(timeZone)
  // Clinic-local weekday + minutes-since-midnight via Intl (DST-correct).
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? ''
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 'NaN')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 'NaN')
  if (Number.isNaN(hour) || Number.isNaN(minute)) return false
  const key = wd.slice(0, 3).toLowerCase() // "Mon" → "mon"
  if (!DAY_KEYS.includes(key as (typeof DAY_KEYS)[number])) return false
  const entry = hours[key]
  if (!entry || entry.closed || !entry.open || !entry.close) return false
  const toMin = (t: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
    if (!m) return null
    const h = Number(m[1])
    const mi = Number(m[2])
    if (h > 23 || mi > 59) return null
    return h * 60 + mi
  }
  const openMin = toMin(entry.open)
  const closeMin = toMin(entry.close)
  if (openMin == null || closeMin == null || closeMin <= openMin) return false
  const nowMin = hour * 60 + minute
  return nowMin >= openMin && nowMin < closeMin
}
