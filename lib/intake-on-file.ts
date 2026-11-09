// "Intake on file" — the ONE predicate (pure; no DB, no server-only).
//
// Before ML-27 every surface meant "ANY submission, ever": a patient who
// filled the form in 2024 was never asked again, and a sedation consent was
// satisfied by last year's general intake. Each auto-send rule (a
// form_template row) now carries two knobs:
//
//   - `appointment_type_ids` — the visit types the form rides with (null =
//     every visit). A visit-specific form (a consent) is on file only when
//     THAT form was filled; a general form is satisfied by any paperwork on
//     file, which is the rule every surface already used.
//   - `refresh_months` — "ask again every N months" (null = never re-ask).
//     The cutoff is a CLINIC-LOCAL month boundary (timezone rule 2): a form
//     filled on the 1st of a month is on file for the whole month N months
//     later, never "yesterday" on a UTC server.
//
// `pickAutoSendForm` is the one chooser for which rule a visit gets: the
// booking confirmation and the forms-reminder cron both ask it, so a sedation
// visit sees the sedation consent on both doors and a cleaning never does.
import { clinicMonthStart } from '@/lib/clinic-timezone'
import {
  coerceAppointmentTypeIds,
  coerceAutoSendAudience,
  coerceRefreshMonths,
} from '@/lib/types/forms'

/** The slice of a form_template row the rules read. */
export interface IntakeAutoSendRule {
  id: string
  isDefault: number
  autoSendAudience: string
  /** string[] | null in jsonb — read through coerceAppointmentTypeIds. */
  appointmentTypeIds?: unknown
  /** number | null — read through coerceRefreshMonths. */
  refreshMonths?: unknown
  updatedAt: Date
}

/** The instant before which a submission is too old for this rule. Null = no window. */
export function intakeRefreshCutoff(
  refreshMonths: unknown,
  now: Date,
  timeZone: string | null | undefined,
): Date | null {
  const months = coerceRefreshMonths(refreshMonths)
  if (months === null) return null
  return clinicMonthStart(now, timeZone, -months)
}

/** Does this rule ride along with a visit of this type? Null types = every visit. */
export function ruleCoversVisitType(rule: Pick<IntakeAutoSendRule, 'appointmentTypeIds'>, appointmentType: string | null | undefined): boolean {
  const ids = coerceAppointmentTypeIds(rule.appointmentTypeIds)
  if (ids === null) return true
  return !!appointmentType && ids.includes(appointmentType)
}

/** A rule aimed at particular visit types (a consent), as opposed to a general intake. */
export function isVisitSpecificRule(rule: Pick<IntakeAutoSendRule, 'appointmentTypeIds'>): boolean {
  return coerceAppointmentTypeIds(rule.appointmentTypeIds) !== null
}

export interface IntakeLatestSubmissions {
  /** The patient's newest submission of ANY form. */
  any: Date | null
  /** The patient's newest submission of THIS rule's form. */
  ofForm: Date | null
}

/**
 * THE PREDICATE. On file = paperwork newer than the rule's window; for a
 * visit-specific form, that form itself. With no window (the default) and a
 * general form this is exactly the old "any submission ever" rule, so nothing
 * changes for a clinic until it sets a rule.
 */
export function isIntakeOnFile(
  rule: Pick<IntakeAutoSendRule, 'appointmentTypeIds' | 'refreshMonths'>,
  latest: IntakeLatestSubmissions,
  now: Date,
  timeZone: string | null | undefined,
): boolean {
  const newest = isVisitSpecificRule(rule) ? latest.ofForm : latest.any
  if (!newest) return false
  const cutoff = intakeRefreshCutoff(rule.refreshMonths, now, timeZone)
  return cutoff === null || newest.getTime() >= cutoff.getTime()
}

export interface AutoSendWant {
  /** Null = the caller does not know (the cron) — audience-specific forms then do not outrank the general ones. */
  isNewPatient: boolean | null
  appointmentType?: string | null
}

/**
 * Pick the form a visit gets. Order, strongest first:
 *   1. only rules covering the visit's type are in the running;
 *   2. a visit-specific rule beats a general one (the sedation consent, not
 *      the intake, for a sedation visit);
 *   3. an audience match ('new' / 'returning') beats an 'all' form, which
 *      beats the org default (the rule getBookingIntakeForm always had);
 *   4. ties: the default, else the most recently edited.
 * Returns null when nothing covers the visit.
 */
export function pickAutoSendForm<T extends IntakeAutoSendRule>(forms: T[], want: AutoSendWant): T | null {
  const covering = forms.filter((f) => ruleCoversVisitType(f, want.appointmentType))
  if (covering.length === 0) return null
  const audience = want.isNewPatient === null ? null : want.isNewPatient ? 'new' : 'returning'
  // A visit-specific rule whose audience fits wins outright; one aimed at the
  // other audience steps aside for the general forms, it never blocks them.
  const specific = pickWithinPool(covering.filter((f) => isVisitSpecificRule(f)), audience)
  if (specific) return specific
  const general = covering.filter((f) => !isVisitSpecificRule(f))
  return pickWithinPool(general, audience) ?? general.find((f) => f.isDefault === 1) ?? null
}

function pickWithinPool<T extends IntakeAutoSendRule>(pool: T[], audience: 'new' | 'returning' | null): T | null {
  if (pool.length === 0) return null
  if (audience) {
    const matched = pool.filter((f) => coerceAutoSendAudience(f.autoSendAudience) === audience)
    if (matched.length > 0) return defaultOrNewest(matched)
  }
  const everyone = pool.filter((f) => coerceAutoSendAudience(f.autoSendAudience) === 'all')
  return everyone.length > 0 ? defaultOrNewest(everyone) : null
}

function defaultOrNewest<T extends IntakeAutoSendRule>(forms: T[]): T {
  return forms.find((f) => f.isDefault === 1) ?? [...forms].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
}
