/**
 * THE LEDGER'S MARKER VOCABULARY — one home, every reader derived from it.
 *
 * WHY THIS FILE EXISTS. The Phase-4 audit ran five rounds and roughly every
 * major defect was the same shape: two pieces of code encoding one concept,
 * one gets updated, the other doesn't, and they disagree silently in the
 * direction that makes the report wrong. Concretely, all of these were the
 * same bug wearing different clothes:
 *
 *   - `isWorkEntry` (JavaScript) and `workOnly()` (SQL) were hand-copies of
 *     one law, so the `report` marker landed in one and not the other.
 *   - The Guardian's failure COUNTER matched two markers while its failure
 *     EXPLAINER matched one, so the alarm fired with an empty explanation.
 *   - `recordFailure` throttled one marker while `reopen()` wrote the other
 *     unthrottled, so one outage became a week of false alarm.
 *
 * Each was fixed locally — "make this function agree with that one" — and
 * the disagreement simply moved one layer over. So the fix is structural:
 * the vocabulary is declared ONCE, here, and every predicate (JS and SQL),
 * every counter and every explainer is GENERATED from these lists. Adding a
 * marker updates all of them at once, because there is nowhere else to edit.
 *
 * Pure and client-safe on purpose: the law must be readable by the UI, the
 * services and the tests without dragging in a database.
 */

/**
 * Markers that take an entry OUT of "work the machine did for this clinic".
 * The standup's counts and stories, and the Guardian's liveness signal, all
 * exclude these — each for a different reason, all of them the same law:
 *
 *  - `autonomyChange` — a settings change (a grant or a hand-back of trust).
 *  - `autoFailure`    — LEGACY hand-back marker (Phase 3). Still recognized
 *                       because production rows carry it; no longer written.
 *  - `failure`        — "I tried and couldn't". Not something that got done.
 *  - `report`         — the Guardian's own heads-up. A watcher must never be
 *                       able to satisfy its own liveness alarm.
 *  - `goalChange`     — the practice pointed the team somewhere (a goal set,
 *                       paused, reached, or put away). An instruction the
 *                       HUMAN gave, exactly like `autonomyChange`; counting
 *                       it as work would let a clinic's own typing inflate
 *                       the machine's week.
 */
export const NOT_WORK_MARKERS = ['autonomyChange', 'autoFailure', 'failure', 'report', 'goalChange'] as const

/**
 * The subset meaning "it tried and couldn't" — what the Guardian's alarm
 * counts and what its explainer describes. These two MUST be the same set,
 * which is why neither gets to write its own list.
 *
 * `autoFailure` is here for historical rows only. Everything new goes
 * through `recordEngineFailure`, which writes `failure` plus a `failureKind`
 * for provenance — one marker, one door.
 */
export const FAILURE_MARKERS = ['failure', 'autoFailure'] as const

/** Where a failure came from. Provenance without a second marker. */
export type FailureKind =
  /** A generator step broke (provider down, unreadable data). */
  | 'engine'
  /** The machine gave a granted card back after repeated attempts. */
  | 'hand_back'

function hasMarker(detail: unknown, markers: readonly string[]): boolean {
  if (!detail || typeof detail !== 'object') return false
  const d = detail as Record<string, unknown>
  // `autonomyChange` and `goalChange` carry a VALUE (the new level / what
  // happened), so presence is the test; the rest are booleans.
  const PRESENCE_MARKERS = new Set(['autonomyChange', 'goalChange'])
  return markers.some((m) => (PRESENCE_MARKERS.has(m) ? d[m] !== undefined : d[m] === true))
}

/** Is this entry WORK — something the machine actually did for the clinic? */
export function isWorkDetail(detail: unknown): boolean {
  return !hasMarker(detail, NOT_WORK_MARKERS)
}

/** Is this entry a failure — "I tried X and couldn't"? */
export function isFailureDetail(detail: unknown): boolean {
  return hasMarker(detail, FAILURE_MARKERS)
}
