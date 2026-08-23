import { clinicDayStart } from '@/lib/clinic-timezone'

/**
 * THE VETO RUNWAY (docs/ai-operations.md, D4 — the owner's day-0
 * deep-sleep ruling). When the machine says yes to its own broadcast work
 * (a social post it drafted under a standing grant), the work does not
 * fire instantly: it is STAGED at the next runway slot — the next
 * clinic-local 10 AM at least RUNWAY_MIN_HOURS away — and shown on the
 * Dream Team's "Going out soon" queue with a one-tap Stop. The visible
 * runway IS the consent mechanism for the deep-sleep lanes; a human tap
 * on Approve stays immediate (a person just said go).
 *
 * Pure. The 10 AM is approximated as clinic-local midnight + 10h, which is
 * off by one hour on the two DST-transition days a year — an acceptable
 * wobble for a staging time, documented rather than hidden.
 */

export const RUNWAY_SEND_HOUR = 10
export const RUNWAY_MIN_HOURS = 12

/**
 * The capabilities whose MACHINE-initiated yes stages on the runway rather
 * than firing immediately. Single-homed: the executor stages exactly these,
 * and the Approval Inbox's copy promises exactly these — the two can never
 * drift into a card that says "queued" while the post already went.
 *
 * content_plan is deliberately ABSENT: every piece it creates is scheduled
 * by construction (the executor resolves dates at approve time), so its work
 * reaches the same visible queue without a second staging rule.
 */
export const RUNWAY_CAPABILITIES: readonly string[] = ['social_post']

export function stagesOnRunway(capability: string): boolean {
  return RUNWAY_CAPABILITIES.includes(capability)
}

/** The next clinic-local RUNWAY_SEND_HOUR at least RUNWAY_MIN_HOURS out. */
export function nextRunwaySlot(now: Date, timeZone: string): Date {
  const min = now.getTime() + RUNWAY_MIN_HOURS * 60 * 60 * 1000
  for (let offset = 0; offset <= 3; offset++) {
    const slot = new Date(
      clinicDayStart(now, timeZone, offset).getTime() + RUNWAY_SEND_HOUR * 60 * 60 * 1000,
    )
    if (slot.getTime() >= min) return slot
  }
  // Unreachable (offset 2 always clears a 12h minimum) — but a math error
  // must degrade to "later" rather than "now".
  return new Date(min)
}
