import 'server-only'

/**
 * Patient recall status derivation. Shared between the patients list and the
 * marketing-audience resolver so behavior stays in lockstep. When a PMS recall
 * date is present (Integrations sync), we PREFER it over the appointment-based
 * heuristic — the clinic's PMS owns the recall engine. When not present, we
 * fall back to the pre-Integrations heuristic so unconnected clinics behave
 * exactly as before.
 */

export type RecallStatus = 'due' | 'overdue' | 'scheduled' | 'na'

/** Platform-wide fallback recall cadence (months) when neither the patient nor
 *  the clinic has set one and there's no PMS recall date. Matches the old
 *  6-month "due" heuristic. */
export const RECALL_DEFAULT_MONTHS = 6
/** A patient is "overdue" once they pass their recall interval + this grace. */
export const RECALL_OVERDUE_GRACE_MONTHS = 3
const MONTH_MS = 30 * 86_400_000

interface DeriveOpts {
  /** PMS-synced next-due date (if any). When present, drives 'due'/'overdue'. */
  pmsRecallDueAt: Date | null
  /** Patient has an appointment in the caller's "near" window → 'scheduled'.
   *  patients list = within 7 days; audience resolver = any future. */
  hasUpcomingAppt: boolean
  /** Patient has ANY future appointment. Suppresses 'due'/'overdue' in the
   *  pre-Integrations fallback so a patient who already has a future booking
   *  isn't also tagged due/overdue (preserves the original semantics). */
  hasAnyFutureAppt: boolean
  /** Most recent past visit. */
  lastVisitAt: Date | null
  now: Date
  /** Resolved recall cadence in months (per-patient override → clinic default).
   *  When set, 'due' fires at `intervalMonths` and 'overdue' at
   *  `intervalMonths + RECALL_OVERDUE_GRACE_MONTHS`. Falls back to the legacy
   *  6/9-month heuristic when omitted. The explicit `dueMs`/`lapsedMs` raw
   *  overrides below still win when provided (audience resolver). */
  intervalMonths?: number | null
  /** Heuristic windows in ms; when set, win over `intervalMonths`. Defaults
   *  match the original derivation. */
  lapsedMs?: number // > this without a visit (+ no upcoming) → 'overdue'
  dueMs?: number // > this without a visit (+ no upcoming) → 'due'
}

const DAY_MS = 86_400_000
const RECALL_WINDOW_DAYS = 30 // PMS recall ±window around the due date.

export function derivePatientRecallStatus(opts: DeriveOpts): RecallStatus {
  // A booked future visit always wins — the recall is on the books.
  if (opts.hasUpcomingAppt) return 'scheduled'
  // ANY future booking (even beyond the near window) suppresses due/overdue —
  // the patient is already coming back. Applied to BOTH the PMS and heuristic
  // branches so a patient booked 2 weeks out isn't tagged overdue by a stale
  // PMS due date (and chased with redundant recall outreach).
  if (opts.hasAnyFutureAppt) return 'na'

  // PMS recall takes precedence when present.
  if (opts.pmsRecallDueAt) {
    const dueMs = opts.pmsRecallDueAt.getTime()
    const nowMs = opts.now.getTime()
    if (dueMs < nowMs - RECALL_WINDOW_DAYS * DAY_MS) return 'overdue'
    if (dueMs <= nowMs + RECALL_WINDOW_DAYS * DAY_MS) return 'due'
    return 'na'
  }

  // Fallback: heuristic from the last visit. A future booking suppresses
  // due/overdue here (matches the original `!next` gate).
  if (opts.hasAnyFutureAppt) return 'na'
  if (!opts.lastVisitAt) return 'na'

  // Resolve the due/overdue thresholds. Precedence:
  //   explicit raw ms (dueMs/lapsedMs) → interval-months → legacy 6/9 default.
  const interval =
    opts.intervalMonths && Number.isFinite(opts.intervalMonths) && opts.intervalMonths > 0
      ? opts.intervalMonths
      : RECALL_DEFAULT_MONTHS
  const dueMs = opts.dueMs ?? interval * MONTH_MS
  const lapsedMs = opts.lapsedMs ?? (interval + RECALL_OVERDUE_GRACE_MONTHS) * MONTH_MS
  const ageMs = opts.now.getTime() - opts.lastVisitAt.getTime()
  if (ageMs >= lapsedMs) return 'overdue'
  if (ageMs >= dueMs) return 'due'
  return 'na'
}
