/**
 * Pure date formatting shared by the email senders and the automated-email
 * merge tokens. Lives outside lib/email.ts on purpose: send-path unit tests
 * mock `@/lib/email`, and the `{{appointmentTime}}` token must keep formatting
 * even when the send function is mocked.
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
