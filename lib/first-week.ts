/**
 * THE FIRST WEEK — the pure half of the platform cockpit
 * (docs/ACTIVATION.md Parts 3 + 5).
 *
 * The cockpit is a REPORT: one row per clinic saying where they are in
 * their first thirty days, what is connected, what the machine has done,
 * when staff last signed in, which activation events have happened, and
 * — the part the owner acts on — why a clinic is STUCK, as a sentence that
 * names the next move. Everything that can be decided from a row alone
 * lives here so the page, the tests and the (later) weekly note agree.
 */

import { ACTIVATION_EVENTS, type Activation, type ActivationKey } from '@/lib/activation'

export { ACTIVATION_EVENTS, type Activation, type ActivationKey }

/** A1's patient-import floor: a CSV of real patients, not a test record or two. */
export const A1_PATIENT_FLOOR = 25

/** The stuck rules (docs/ACTIVATION.md Part 3), as thresholds. */
export const STUCK = {
  /** No data by this day → "call about the PMS". */
  noDataByDay: 3,
  /** No staff sign-in for this many days. */
  quietStaffDays: 7,
  /** Data connected, machine did nothing for this many days. */
  quietMachineDays: 7,
  /** A sign-here card waiting this many days. */
  cardWaitingDays: 3,
  /** A door pending on US (PMS bind, SMS carrier) for this many days. */
  pendingOnUsDays: 5,
  /** The morning email still off by this day — the day-two email (law 6) can't arrive. */
  digestOffByDay: 1,
} as const

export interface FirstWeekRowInput {
  createdAt: Date
  /** The readiness grades the cockpit shows (pms/patients/gbp/inbox/payments/sms…). */
  facts: Array<{ id: string; grade: string }>
  patientCount: number
  /** Work entries in the last 7 days (the ledger's workOnly law). */
  workLast7: number
  openCards: number
  oldestOpenCardAt: Date | null
  lastStaffSignInAt: Date | null
  activation: Activation
  /** Doors pending on the platform: the PMS bind request, the SMS carrier wait. */
  pendingOnUs: Array<{ label: string; since: Date }>
  /** The morning email switch (S7): off means day two arrives silent. */
  digestOn: boolean
}

const DAY = 24 * 60 * 60 * 1000

export function dayNumber(createdAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / DAY))
}

export function daysSince(at: Date | null, now: Date): number | null {
  return at ? Math.floor((now.getTime() - at.getTime()) / DAY) : null
}

/** Which activation events have happened, in order; the next one is the clinic's next milestone. */
export function activationProgress(a: Activation): { done: ActivationKey[]; next: ActivationKey | null } {
  const done = ACTIVATION_EVENTS.filter((e) => a[e.key] != null).map((e) => e.key)
  const next = ACTIVATION_EVENTS.find((e) => a[e.key] == null)?.key ?? null
  return { done, next }
}

/**
 * The reasons to call, each a sentence that names the next move. Empty =
 * nothing is stuck. Order is the order the owner should care: no data
 * first (nothing else can happen), then the human went quiet, then the
 * machine went quiet, then work is piling up, then it is on us.
 */
export function stuckFlags(row: FirstWeekRowInput, now: Date): string[] {
  const out: string[] = []
  const day = dayNumber(row.createdAt, now)
  const hasData = row.activation.a1 != null
  if (!hasData && day >= STUCK.noDataByDay) {
    out.push(`No data by day ${day} — call about the PMS, or send the patient CSV.`)
  }
  const quietStaff = daysSince(row.lastStaffSignInAt, now)
  if (row.lastStaffSignInAt == null && day >= STUCK.quietStaffDays) {
    out.push('Nobody has signed in yet — the invite may be sitting in a spam folder.')
  } else if (quietStaff != null && quietStaff >= STUCK.quietStaffDays) {
    out.push(`No staff sign-in for ${quietStaff} days — the morning email may be the only thing they see.`)
  }
  if (hasData && row.workLast7 === 0 && day >= STUCK.quietMachineDays) {
    out.push('Data is connected and the machine did nothing this week — check the Guardian for this clinic.')
  }
  const waiting = daysSince(row.oldestOpenCardAt, now)
  if (row.openCards > 0 && waiting != null && waiting >= STUCK.cardWaitingDays) {
    out.push(`${row.openCards} card${row.openCards === 1 ? '' : 's'} waiting on them for ${waiting} days — a nudge, or take it off their plate.`)
  }
  for (const p of row.pendingOnUs) {
    const d = daysSince(p.since, now) ?? 0
    if (d >= STUCK.pendingOnUsDays) out.push(`${p.label} has been on us for ${d} days.`)
  }
  // S7: the morning after is the product, and it rides the digest. A clinic
  // whose switch is still off after the call will not get the day-two email
  // the call promised — the setup call's fourth beat was skipped.
  if (!row.digestOn && day >= STUCK.digestOffByDay) {
    out.push('The morning email is off — nothing arrives on day two. Turn it on (Settings → Notifications) at the call.')
  }
  return out
}

/** A one-word stage for the row's eyebrow. */
export function stageOf(row: FirstWeekRowInput, now: Date): 'new' | 'first-week' | 'first-month' | 'settled' {
  const day = dayNumber(row.createdAt, now)
  if (day < 1) return 'new'
  if (day < 7) return 'first-week'
  if (day < 30) return 'first-month'
  return 'settled'
}
