/**
 * DECAY — pure (P-03).
 *
 * A prospect nobody has touched in `config.hygiene.staleAfterDays` (default
 * 90) is not a lead any more; it is a row pretending to be one. It RESTS:
 * `status = 'dormant'`, off every queue and the default table, with the
 * status it came from remembered in `dormant_from_status` so any new
 * inbound signal (a reply, a call outcome, a grader run, a demo request) or
 * a re-verify that IMPROVES its quality puts it straight back. Not
 * disqualified, not deleted — resting.
 *
 * "Touch" means a human or the outreach engine did something WITH the
 * practice: a sent touch, a logged call, an inbound event, an intent
 * signal; being enriched counts as the first one (so a freshly enriched
 * row the hunter has not reached yet is not stale on day one). A row with
 * a future follow-up or an open enrollment is being worked and never rests.
 */

import { DECAYABLE_STATUSES, type DecayableStatus } from './db/schema/prospecting'

const DAY_MS = 24 * 60 * 60 * 1000

export interface DecayInput {
  status: string
  /** GREATEST of the last sent touch, call, inbound event, intent and
   *  enrichment stamps — null when none of those ever happened. */
  lastTouchAt: Date | null
  createdAt: Date
  nextFollowUpAt: Date | null
  hasOpenEnrollment: boolean
}

export interface DecayVerdict {
  dormant: boolean
  /** The stamp the "No touch since" sentence names (the anchor). */
  since: Date
  reason: string | null
}

export function isDecayableStatus(status: string): status is DecayableStatus {
  return (DECAYABLE_STATUSES as readonly string[]).includes(status)
}

/** "Aug 12, 2026" in UTC — the platform runs in UTC and says so. */
export function utcDayLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

/** The sentence a resting row carries FIRST in `quality_reasons`. */
export function restingReason(since: Date): string {
  return `No touch since ${utcDayLabel(since)} UTC — resting`
}

export function isRestingReason(s: unknown): boolean {
  return typeof s === 'string' && /^No touch since .+ — resting$/.test(s)
}

/** `quality_reasons` with the resting sentence put first (once). */
export function withRestingReason(reasons: unknown, since: Date): string[] {
  const rest = (Array.isArray(reasons) ? reasons : []).filter((r): r is string => typeof r === 'string' && !isRestingReason(r))
  return [restingReason(since), ...rest]
}

/** `quality_reasons` with every resting sentence removed. */
export function withoutRestingReason(reasons: unknown): string[] {
  return (Array.isArray(reasons) ? reasons : []).filter((r): r is string => typeof r === 'string' && !isRestingReason(r))
}

export function decayVerdict(input: DecayInput, config: { staleAfterDays: number }, now: Date): DecayVerdict {
  const since = input.lastTouchAt ?? input.createdAt
  const none = { dormant: false, since, reason: null }
  if (!isDecayableStatus(input.status)) return none
  if (input.hasOpenEnrollment) return none
  if (input.nextFollowUpAt && input.nextFollowUpAt.getTime() > now.getTime()) return none
  const cutoff = now.getTime() - config.staleAfterDays * DAY_MS
  if (since.getTime() >= cutoff) return none
  return { dormant: true, since, reason: restingReason(since) }
}

/** Where a resting row goes when it wakes: the status it came from, or
 *  `enriched` when the memory is missing or not a status it could have
 *  rested from (a row only ever rests from a decayable status). */
export function wakeStatus(dormantFromStatus: string | null | undefined): DecayableStatus {
  return dormantFromStatus && isDecayableStatus(dormantFromStatus) ? dormantFromStatus : 'enriched'
}
