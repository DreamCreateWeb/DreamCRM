/**
 * Pure date formatting shared by the email senders, the automated-email
 * merge tokens, and every SERVER-side surface that renders a wall-clock time.
 * Lives outside lib/email.ts on purpose: send-path unit tests mock
 * `@/lib/email`, and the `{{appointmentTime}}` token must keep formatting
 * even when the send function is mocked.
 *
 * The prod server runs in UTC, so any time string built server-side (server
 * component, server action, service, email, comm-log note) MUST format
 * against the clinic's IANA timezone — a bare `toLocaleString` renders UTC
 * ("6:00 PM" for a 1 PM Central visit). The helpers below make the timezone
 * REQUIRED so a call site can't forget. Resolve it via
 * `getClinicTimeZone(orgId)` (lib/services/clinic-timezone.ts) or
 * `sender.timeZone` when a ClinicSender is already loaded.
 */

/**
 * Format an appointment datetime at the clinic's wall-clock. The single source
 * of truth for both the confirmation/cancellation date box AND the
 * `{{appointmentTime}}` merge token, so an edited email and the box always agree.
 */
export function formatClinicDateTime(date: Date, timeZone?: string): string {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  })
}

/** Compact "Wed, Jul 1, 1:00 PM" at the clinic's wall-clock — timelines,
 *  activity feeds, staff notifications, comm-log notes. */
export function formatClinicDayTime(date: Date, timeZone: string): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })
}

/** Bare "1:00 PM" at the clinic's wall-clock — schedule rows whose day is
 *  already established by a surrounding header. */
export function formatClinicTime(date: Date, timeZone: string): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
}

/** "Wednesday, July 1" (no year) at the clinic's calendar — day headers. */
export function formatClinicDayHeader(date: Date, timeZone: string): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone })
}

/**
 * The clinic-local calendar day of an instant, as a sortable `YYYY-MM-DD` key.
 * Grouping/bucketing by day must use THIS, not `startOfDay(date)` — a 7 PM
 * Central visit is already "tomorrow" in UTC and would land under the wrong
 * agenda day header.
 */
export function clinicDayKey(date: Date, timeZone: string): string {
  // en-CA reliably formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}
