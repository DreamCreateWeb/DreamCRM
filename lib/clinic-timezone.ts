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
