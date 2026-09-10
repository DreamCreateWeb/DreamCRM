import 'server-only'
import { sql, type SQL } from 'drizzle-orm'
import { schema } from '@/lib/db'

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
/** PMS recall ±window around the due date. */
export const RECALL_WINDOW_DAYS = 30
/** One recall month, in ms. Both the JS derivation and its SQL twin
 *  (`recallDueWhereSql`) measure the interval with this. */
export const RECALL_MONTH_MS = MONTH_MS

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

// ── The SQL twin ─────────────────────────────────────────────────────────────

/**
 * `recallStatus in ('due','overdue')` as a WHERE clause, for the patients list.
 *
 * THIS IS A TWIN OF `derivePatientRecallStatus` ABOVE AND MOVES WITH IT. It
 * exists because the list has to PAGE: a filter applied in JavaScript after the
 * load truncates the wrong set — `LIMIT 100` then "keep the recall-due ones"
 * returns the recall-due patients out of the first hundred, not the first
 * hundred recall-due patients. So this one predicate is expressed twice, and
 * the duplication is contained deliberately: it lives HERE, beside the
 * derivation it mirrors, reads the SAME constants, and answers only the
 * due/overdue question (never 'scheduled'/'na', which nothing filters on).
 * `tests/patients/recall-sql-parity.test.ts` walks a case matrix through the
 * derivation and pins the SQL against the same expectations.
 *
 * Reading it against the derivation, branch for branch:
 *   - `hasUpcomingAppt` → 'scheduled': any appointment inside the list's
 *     near window, WHATEVER its status — the list's own near-window read does
 *     not exclude cancelled ones, and this mirrors that exactly rather than
 *     quietly improving on it.
 *   - `hasAnyFutureAppt` → 'na': any live future booking.
 *   - PMS branch: 'due' is at or before `now + RECALL_WINDOW_DAYS`, 'overdue'
 *     is further back still, so their union is the single `<=` bound here.
 *   - heuristic branch: a last visit at least `interval` months old, where
 *     interval is the patient's own override when usable, else the clinic's.
 *     A patient with NO last visit derives 'na', and the `max()` here is NULL,
 *     so the comparison is NULL and the row drops out — which is why it is
 *     deliberately not coalesced to a sentinel date.
 *
 * No `--` comments inside the template: one flattening of the rendered
 * statement would comment out everything after them.
 */
export function recallDueWhereSql(opts: {
  organizationId: string
  now: Date
  /** The list's near window end (now + 7 days) — the `hasUpcomingAppt` input. */
  nearWindowEnd: Date
  /** Clinic cadence in months, already floored to a usable value by the caller. */
  defaultIntervalMonths: number
}): SQL {
  const { organizationId, now, nearWindowEnd, defaultIntervalMonths } = opts
  const pmsCutoff = new Date(now.getTime() + RECALL_WINDOW_DAYS * DAY_MS)
  const monthDays = RECALL_MONTH_MS / DAY_MS
  const p = schema.patient
  const a = schema.appointment
  return sql`
    not exists (
      select 1 from ${a}
      where ${a.organizationId} = ${organizationId}
        and ${a.patientId} = ${p.id}
        and ${a.startTime} >= ${now}
        and ${a.startTime} <= ${nearWindowEnd}
    )
    and not exists (
      select 1 from ${a}
      where ${a.organizationId} = ${organizationId}
        and ${a.patientId} = ${p.id}
        and ${a.startTime} >= ${now}
        and ${a.status} not in ('cancelled', 'no_show')
    )
    and case
      when ${p.pmsRecallDueAt} is not null then ${p.pmsRecallDueAt} <= ${pmsCutoff}
      else (
        select max(${a.startTime}) from ${a}
        where ${a.organizationId} = ${organizationId}
          and ${a.patientId} = ${p.id}
          and ${a.startTime} <= ${now}
          and ${a.status} not in ('cancelled', 'no_show')
      ) <= ${now}::timestamp - (
        (case
          when ${p.recallIntervalMonths} is not null and ${p.recallIntervalMonths} > 0
            then ${p.recallIntervalMonths}
          else ${defaultIntervalMonths}::int
        end)::int * interval '${sql.raw(String(monthDays))} days'
      )
    end
  `
}
