/**
 * ACTIVATION IS MEASURED — docs/ACTIVATION.md law 7, slice S8.
 *
 * "Five events per clinic, time to each, visible to the platform. A program
 * with no number is a mood." This is the pure arithmetic over the stamps:
 * given each clinic's creation instant and its five activation stamps,
 * how many reached each event and how long it took — measured from the day
 * the org was made, because that is the day the setup call happened and
 * the clock the stuck rules already use.
 *
 * Time-to-A1 is the number the program lives or dies on (Part 3): a clinic
 * without A1 inside 48 hours is stuck by definition, so the share that
 * made it inside that window is reported beside the median.
 */

import { ACTIVATION_EVENTS, type Activation, type ActivationKey } from '@/lib/activation'
import { STUCK } from '@/lib/first-week'

/** Clinics created inside this window make up the cohort the numbers describe. */
export const COHORT_DAYS = 90
/** The Part-3 line: data connected within two days of the call, or stuck. */
export const A1_TARGET_HOURS = 48

const HOUR = 60 * 60 * 1000

export interface ActivationCohortRow {
  createdAt: Date
  activation: Activation
}

export interface EventMetric {
  key: ActivationKey
  label: string
  short: string
  /** Clinics in the cohort that reached it. */
  reached: number
  /** Median hours from org creation to the event, over the clinics that reached it. */
  medianHours: number | null
}

export interface ActivationMetrics {
  cohortDays: number
  /** Clinics in the cohort (created inside the window, demo excluded by the reader). */
  clinics: number
  events: EventMetric[]
  /** A1 inside A1_TARGET_HOURS: how many, and the share of the cohort (null when the cohort is empty). */
  a1Within: { reached: number; share: number | null }
  /** Cohort clinics past the no-data stuck day with no A1 — the ones to call. */
  noDataPastDue: number
}

/** Hours from creation to the event; an event dated before creation (imported history) counts as 0. */
export function hoursTo(createdAt: Date, at: Date): number {
  return Math.max(0, (at.getTime() - createdAt.getTime()) / HOUR)
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** "35m" · "6h" · "1.5 days" · "12 days" — hours, for a human. */
export function describeHours(hours: number | null): string {
  if (hours == null) return '—'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`
  if (hours < 24) return `${Math.round(hours)}h`
  const days = hours / 24
  return days < 10 ? `${(Math.round(days * 10) / 10).toString().replace(/\.0$/, '')} days` : `${Math.round(days)} days`
}

/** Keep only the clinics created inside the cohort window. */
export function inCohort(rows: ActivationCohortRow[], now: Date, cohortDays = COHORT_DAYS): ActivationCohortRow[] {
  const since = now.getTime() - cohortDays * 24 * HOUR
  return rows.filter((r) => r.createdAt.getTime() >= since && r.createdAt.getTime() <= now.getTime())
}

export function computeActivationMetrics(rows: ActivationCohortRow[], now: Date, cohortDays = COHORT_DAYS): ActivationMetrics {
  const cohort = inCohort(rows, now, cohortDays)
  const events: EventMetric[] = ACTIVATION_EVENTS.map((e) => {
    const hours = cohort.flatMap((r) => {
      const at = r.activation[e.key]
      return at ? [hoursTo(r.createdAt, at)] : []
    })
    return { key: e.key, label: e.label, short: e.short, reached: hours.length, medianHours: median(hours) }
  })
  const within = cohort.filter((r) => r.activation.a1 != null && hoursTo(r.createdAt, r.activation.a1) <= A1_TARGET_HOURS).length
  // The share's denominator is the clinics the line can JUDGE: those that
  // reached A1, or have been around the full 48 hours without it. A signup
  // from this morning is undecided, not a miss (audit round 2).
  const decided = cohort.filter((r) => r.activation.a1 != null || (now.getTime() - r.createdAt.getTime()) / HOUR >= A1_TARGET_HOURS).length
  const noDataPastDue = cohort.filter((r) => r.activation.a1 == null && (now.getTime() - r.createdAt.getTime()) / (24 * HOUR) >= STUCK.noDataByDay).length
  return {
    cohortDays,
    clinics: cohort.length,
    events,
    a1Within: { reached: within, share: decided > 0 ? within / decided : null },
    noDataPastDue,
  }
}
