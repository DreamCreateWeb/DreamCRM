/**
 * The one sentence a patient reads about a past_due payment plan — the
 * /i/[token] landing and the portal Billing page both render it, so the two
 * surfaces can never drift apart on what is actually scheduled.
 *
 * `nextLabel` is the retry day ALREADY formatted for the viewer (the portal
 * formats it in the clinic tz; the landing in the browser), or null when the
 * plan is PARKED: after MAX_FAILED_ATTEMPTS the cron sets `nextChargeAt`
 * to null and nothing is scheduled. The law: never "we'll retry" with nothing
 * scheduled. Pure + client-safe.
 */
export function planPastDueNotice(nextLabel: string | null): string {
  return nextLabel
    ? `The last charge didn’t go through — we’ll try again on ${nextLabel}. Update your card now and we’ll charge it right away instead.`
    : 'We’ve paused the plan — update your card to pick it back up.'
}

/** A past_due plan with no retry on the calendar. */
export function isPlanParked(status: string, nextChargeAt: Date | string | null | undefined): boolean {
  return status === 'past_due' && !nextChargeAt
}
