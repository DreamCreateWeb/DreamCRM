// Pure follow-up cadence — how a logged call outcome schedules (or clears) the
// next nudge, so a warm prospect never goes cold because a callback slipped.
// No deps, so the cadence is unit-testable; logCallOutcome applies it.

// Non-terminal outcomes → days until the next follow-up + why.
const FOLLOWUP_CADENCE: Record<string, { days: number; reason: string }> = {
  callback: { days: 1, reason: 'They asked for a callback' },
  voicemail: { days: 2, reason: 'Left a voicemail — circle back' },
  no_answer: { days: 2, reason: 'No answer — try again' },
  // Reached the desk, not the decision maker (P-01): worth another try,
  // but give them a few days — a same-week second call reads as pestering.
  gatekeeper: { days: 3, reason: 'Reached the desk — try for the decision maker' },
}

/**
 * The follow-ups the SYSTEM schedules (a no-answer, a voicemail, a desk
 * reached) — the ones a retired-practice park clears so the follow-up
 * bucket never dials a parked practice. A callback a human promised is
 * not on this list: a person said "call me", and a person keeps it.
 */
export const SYSTEM_FOLLOWUP_REASONS: readonly string[] = ['voicemail', 'no_answer', 'gatekeeper'].map(
  (k) => FOLLOWUP_CADENCE[k].reason,
)

/** Pure: did a human promise this follow-up (a callback they asked for)? */
export function isHumanPromisedFollowUp(reason: string | null | undefined): boolean {
  return Boolean(reason) && !SYSTEM_FOLLOWUP_REASONS.includes(reason as string)
}

export interface FollowUpPlan {
  /** When to nudge next; null clears any pending follow-up (terminal outcome). */
  at: Date | null
  reason: string | null
}

/**
 * Given a call outcome, decide the next follow-up. Callback/voicemail/no-answer
 * schedule a dated nudge; everything else (demo_booked, won, not_interested,
 * …) is terminal for the follow-up loop and clears it — the meeting, the win,
 * or the "no" is the next step, not another call.
 */
export function followUpForOutcome(outcome: string, now: Date = new Date()): FollowUpPlan {
  const c = FOLLOWUP_CADENCE[outcome]
  if (!c) return { at: null, reason: null }
  return { at: new Date(now.getTime() + c.days * 24 * 60 * 60 * 1000), reason: c.reason }
}

/** Human "due 2 days ago" / "due today" label for a scheduled follow-up. */
export function followUpDueLabel(at: Date, now: Date = new Date()): string {
  const dayMs = 24 * 60 * 60 * 1000
  const diffDays = Math.floor((now.getTime() - at.getTime()) / dayMs)
  if (diffDays <= 0) return 'due today'
  if (diffDays === 1) return 'due yesterday'
  return `due ${diffDays} days ago`
}
