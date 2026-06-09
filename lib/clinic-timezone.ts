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
