/**
 * THE NEXT VISIT'S SUGGESTED DAY — pure, clinic-calendar.
 *
 * When a visit is marked done and nothing is on the books after it, the front
 * desk's next move is to book the one after it ("see you in six months"). The
 * day that booking opens on is seeded from the same ladder the recall engine
 * reads: the patient's own recall interval, then the practice's default
 * (Settings → Practice), then six months. `> 0` is the valid test on each rung
 * — `??` does not fall through on a stored 0 (lib/services/recall-status.ts
 * documents the trap) — so a zero or a negative reads as "not set".
 *
 * The arithmetic is done on the CLINIC'S calendar date of the visit (timezone
 * rule 2): the server's clock is UTC, so a 7:30 PM Central cleaning is already
 * tomorrow there, and six months from the wrong day lands on the wrong day.
 * The result is a `YYYY-MM-DD` key, which is what the booking drawer's date
 * field takes and what the slot read interprets in the clinic's zone.
 *
 * Nothing here touches the recall engine — this is a seed for a human's next
 * click, not a due date.
 */
import { clinicLocalDate } from '@/lib/clinic-timezone'

/** Mirrors RECALL_DEFAULT_MONTHS (lib/services/recall-status.ts, server-only). */
export const NEXT_VISIT_DEFAULT_MONTHS = 6

/** The recall rung that applies: patient → clinic → the default. */
export function resolveRecallMonths(
  patientMonths: number | null | undefined,
  clinicMonths: number | null | undefined,
): number {
  if (typeof patientMonths === 'number' && Number.isFinite(patientMonths) && patientMonths > 0) {
    return Math.round(patientMonths)
  }
  if (typeof clinicMonths === 'number' && Number.isFinite(clinicMonths) && clinicMonths > 0) {
    return Math.round(clinicMonths)
  }
  return NEXT_VISIT_DEFAULT_MONTHS
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Days in a calendar month (month 1–12). Built in UTC so it is zone-free. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * `YYYY-MM-DD` plus N calendar months, the day clamped to the target month's
 * length (Aug 31 + 6 → Feb 28, or 29 in a leap year) rather than overflowing
 * into March the way `Date#setMonth` does. Pure calendar arithmetic — a
 * calendar date has no zone.
 */
export function addMonthsToDateKey(dateKey: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!m) throw new Error(`addMonthsToDateKey: not a YYYY-MM-DD key: ${dateKey}`)
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const total = y * 12 + (mo - 1) + Math.trunc(months)
  const ty = Math.floor(total / 12)
  const tm = (total % 12) + 1
  const td = Math.min(d, daysInMonth(ty, tm))
  return `${ty}-${pad2(tm)}-${pad2(td)}`
}

/**
 * The day to seed "Book their next visit" on: the visit's clinic-local date
 * plus the resolved recall interval.
 */
export function suggestNextVisitDateKey(
  startTime: Date,
  timeZone: string | null | undefined,
  recall: { patientMonths: number | null | undefined; clinicMonths: number | null | undefined },
): string {
  const { year, month, day } = clinicLocalDate(startTime, timeZone)
  const base = `${year}-${pad2(month)}-${pad2(day)}`
  return addMonthsToDateKey(base, resolveRecallMonths(recall.patientMonths, recall.clinicMonths))
}
