/**
 * THE RECALL CADENCE — one pure home for every number that follows the
 * practice's own setting (ML-29, G3-14).
 *
 * A clinic sets two things once (Settings → Practice): how often it wants to
 * see a patient (`clinic_profile.recall_default_months`) and how long
 * without a visit makes someone 💤 lapsed (`lapsed_after_months`). The
 * derivation already honoured them (lib/services/recall-status.ts, the
 * lifecycle twin, lib/next-visit.ts) while three other places kept their own
 * "6 months" / "9 months" / 270 days: the outreach-tier copy, the
 * reactivation automation's window and the settings card's sentence. Those
 * now read from here, so the sentence a clinic reads, the audience it mails
 * and the day its next visit opens on can never say three different things.
 *
 * Client-safe on purpose (no db, no 'server-only'): the queue page's legend
 * and the automations card render these words.
 */
import { LAPSED_DEFAULT_MONTHS } from '@/lib/dates'

/** Platform-wide fallback recall interval (months) when neither the patient
 *  nor the clinic set one. */
export const RECALL_DEFAULT_MONTHS = 6
/** A patient is "overdue" once they pass their recall interval + this grace. */
export const RECALL_OVERDUE_GRACE_MONTHS = 3
/** One recall month, in days — the derivation and its SQL twin both measure
 *  with ~30-day months, and so does every window built here. */
export const RECALL_MONTH_DAYS = 30

/** The two settings as the cadence read returns them (null = not set). */
export interface RecallCadenceInput {
  recallMonths: number | null | undefined
  lapsedMonths: number | null | undefined
}

/** The cadence a day-0 practice runs on — every default, nothing set. */
export const DEFAULT_RECALL_CADENCE: RecallCadenceInput = { recallMonths: null, lapsedMonths: null }

function usable(months: number | null | undefined): number | null {
  return typeof months === 'number' && Number.isFinite(months) && months > 0 ? Math.round(months) : null
}

/** The clinic's recall interval in months — its setting, else the default.
 *  `> 0` is the test on purpose: `??` does not fall through on a stored 0
 *  (the trap recall-status.ts documents). */
export function clinicRecallMonths(cadence: RecallCadenceInput): number {
  return usable(cadence.recallMonths) ?? RECALL_DEFAULT_MONTHS
}

/** Months without a visit before the clinic calls a patient lapsed — its
 *  own line, else the industry default (`lapsedCutoff` applies the same rule). */
export function clinicLapsedMonths(cadence: RecallCadenceInput): number {
  return usable(cadence.lapsedMonths) ?? LAPSED_DEFAULT_MONTHS
}

/** The "overdue" line in months: the recall interval plus the grace period
 *  (6 + 3 = 9 by default — the number the reactivation window used to carry
 *  as a bare 270). */
export function clinicOverdueMonths(cadence: RecallCadenceInput): number {
  return clinicRecallMonths(cadence) + RECALL_OVERDUE_GRACE_MONTHS
}

/**
 * The reactivation automation's "newly lapsed" window, in days since the
 * last visit: a patient drifts past the overdue line exactly once before the
 * window moves on, so the monthly send catches them once instead of nagging
 * the long-gone every month. [fromMonths, toMonths) is the same window in
 * months, for the sentence beside the toggle.
 */
export function reactivationWindow(cadence: RecallCadenceInput): {
  fromMonths: number
  toMonths: number
  minDays: number
  maxDays: number
} {
  const fromMonths = clinicOverdueMonths(cadence)
  const toMonths = fromMonths + 1
  return {
    fromMonths,
    toMonths,
    minDays: fromMonths * RECALL_MONTH_DAYS,
    maxDays: toMonths * RECALL_MONTH_DAYS,
  }
}

/** "Last cleaning over 6 months ago, no future booking" — the recall-due
 *  tier's one sentence, with the practice's own number in it. */
export function recallDueDescription(cadence: RecallCadenceInput): string {
  return `Last cleaning over ${clinicRecallMonths(cadence)} months ago, no future booking`
}

/** The lapsed tier's sentence: the clinic's own line, plus the overdue rule. */
export function lapsedTierDescription(cadence: RecallCadenceInput): string {
  const lapsed = clinicLapsedMonths(cadence)
  return `No visit in ${lapsed}+ months, or past their recall window — nothing booked. The cold ones`
}

/** The reactivation automation's audience, in words: who the monthly note
 *  reaches on this practice's cadence. */
export function reactivationAudienceDescription(cadence: RecallCadenceInput): string {
  const w = reactivationWindow(cadence)
  return `patients whose last visit was ${w.fromMonths}–${w.toMonths} months ago, with no upcoming visit booked`
}
