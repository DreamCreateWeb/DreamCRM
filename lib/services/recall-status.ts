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
  /** Heuristic windows; defaults match the original derivation. */
  lapsedMs?: number // > this without a visit (+ no upcoming) → 'overdue' (default 9mo)
  dueMs?: number // > this without a visit (+ no upcoming) → 'due' (default 6mo)
}

const DAY_MS = 86_400_000
const RECALL_WINDOW_DAYS = 30 // PMS recall ±window around the due date.

export function derivePatientRecallStatus(opts: DeriveOpts): RecallStatus {
  // A booked future visit always wins — the recall is on the books.
  if (opts.hasUpcomingAppt) return 'scheduled'

  // PMS recall takes precedence when present.
  if (opts.pmsRecallDueAt) {
    const dueMs = opts.pmsRecallDueAt.getTime()
    const nowMs = opts.now.getTime()
    if (dueMs < nowMs - RECALL_WINDOW_DAYS * DAY_MS) return 'overdue'
    if (dueMs <= nowMs + RECALL_WINDOW_DAYS * DAY_MS) return 'due'
    return 'na'
  }

  // Fallback: pre-Integrations heuristic from the last visit. A future booking
  // suppresses due/overdue here (matches the original `!next` gate).
  if (opts.hasAnyFutureAppt) return 'na'
  const lapsedMs = opts.lapsedMs ?? 9 * 30 * DAY_MS
  const dueMs = opts.dueMs ?? 6 * 30 * DAY_MS
  if (!opts.lastVisitAt) return 'na'
  const ageMs = opts.now.getTime() - opts.lastVisitAt.getTime()
  if (ageMs >= lapsedMs) return 'overdue'
  if (ageMs >= dueMs) return 'due'
  return 'na'
}
