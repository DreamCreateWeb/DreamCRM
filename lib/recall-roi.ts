/**
 * The recall-revenue calculator's PURE math (marketing-engine Part 9 A①,
 * the research's named next free tool). Client-safe on purpose — the
 * calculator runs entirely in the visitor's browser and nothing they type
 * is ever sent anywhere (that privacy is part of the pitch).
 *
 * Honesty laws, same as the grader: the headline number is what's AT
 * STAKE (arithmetic on the visitor's own inputs), never a promise; the
 * recovery column shows THREE hedged scenarios instead of one rosy one,
 * and the copy calls them scenarios out loud. Nothing here projects a
 * practice's actual results.
 */

export interface RecallRoiInputs {
  /** Active patient charts. */
  activePatients: number
  /** % of active patients currently ON a hygiene recall schedule (0–100). */
  onSchedulePct: number
  /** Average revenue of one hygiene visit, dollars. */
  visitValue: number
}

/** Hygiene cadence: two recall visits per patient per year (6-month recall
 *  — the standard the whole industry schedules around). */
export const VISITS_PER_PATIENT_PER_YEAR = 2

/** The hedged win-back scenarios. Deliberately three, deliberately capped
 *  well under 100% — a recall engine reaches people; it doesn't teleport
 *  them into chairs. */
export const WIN_BACK_SCENARIOS = [
  { key: 'cautious', label: 'Cautious', rate: 0.1 },
  { key: 'typical', label: 'Middling', rate: 0.25 },
  { key: 'strong', label: 'Strong', rate: 0.4 },
] as const

/** What DreamCRM costs, for the honest break-even line. */
export const PLAN_PRICE_MONTHLY = 200

export interface RecallRoiScenario {
  key: (typeof WIN_BACK_SCENARIOS)[number]['key']
  label: string
  ratePct: number
  visitsPerYear: number
  revenuePerYear: number
  revenuePerMonth: number
}

export interface RecallRoiResult {
  /** Patients currently off the recall schedule. */
  offSchedulePatients: number
  /** Hygiene visits those patients would attend per year if on schedule. */
  missedVisitsPerYear: number
  /** The headline: revenue at stake per year (arithmetic, not a promise). */
  atStakePerYear: number
  atStakePerMonth: number
  scenarios: RecallRoiScenario[]
  /** Booked-back visits per MONTH that cover the $200 plan. */
  breakEvenVisitsPerMonth: number
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Total + deterministic; junk inputs degrade to zeros, never NaN. */
export function computeRecallRoi(raw: RecallRoiInputs): RecallRoiResult {
  const patients = Number.isFinite(raw.activePatients) ? clamp(Math.round(raw.activePatients), 0, 100_000) : 0
  const onPct = Number.isFinite(raw.onSchedulePct) ? clamp(raw.onSchedulePct, 0, 100) : 0
  const value = Number.isFinite(raw.visitValue) ? clamp(raw.visitValue, 0, 5_000) : 0

  const offSchedulePatients = Math.round(patients * (1 - onPct / 100))
  const missedVisitsPerYear = offSchedulePatients * VISITS_PER_PATIENT_PER_YEAR
  const atStakePerYear = Math.round(missedVisitsPerYear * value)

  const scenarios: RecallRoiScenario[] = WIN_BACK_SCENARIOS.map((s) => {
    const visitsPerYear = Math.round(missedVisitsPerYear * s.rate)
    const revenuePerYear = Math.round(visitsPerYear * value)
    return {
      key: s.key,
      label: s.label,
      ratePct: Math.round(s.rate * 100),
      visitsPerYear,
      revenuePerYear,
      revenuePerMonth: Math.round(revenuePerYear / 12),
    }
  })

  return {
    offSchedulePatients,
    missedVisitsPerYear,
    atStakePerYear,
    atStakePerMonth: Math.round(atStakePerYear / 12),
    scenarios,
    breakEvenVisitsPerMonth: value > 0 ? Math.ceil(PLAN_PRICE_MONTHLY / value) : 0,
  }
}
