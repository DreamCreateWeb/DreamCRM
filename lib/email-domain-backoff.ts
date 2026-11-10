/** Client-safe: the sweep's backoff rule for a failing Resend domain (ML-63b). */

/** After this many consecutive failed checks the sweep asks once a day. */
export const EMAIL_DOMAIN_BACKOFF_AFTER = 3
export const EMAIL_DOMAIN_BACKOFF_MS = 24 * 60 * 60 * 1000

/** Pure: has this domain failed enough times to be on the daily cadence? */
export function isBackedOff(failedChecks: number | null | undefined): boolean {
  return (failedChecks ?? 0) >= EMAIL_DOMAIN_BACKOFF_AFTER
}
