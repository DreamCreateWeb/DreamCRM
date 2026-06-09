import 'server-only'
import { and, eq, gte, lte, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appointment } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import { parseOdDateTime, formatOdDate } from './pms/datetime'
import { CLINIC_DEFAULT_TZ, dayOfWeekForDateKey } from '@/lib/clinic-timezone'

/**
 * Public-site booking availability service. Computes the slot grid for a
 * given day based on (a) the clinic's configured hours and (b) appointments
 * already on the books. Returns 30-minute slots within the clinic's open
 * window, marking each as available or taken.
 *
 * Timezone: the clinic's `hours` are wall-clock strings ("09:00") with no zone,
 * and prod runs in UTC — so the grid is generated against the clinic's IANA
 * timezone (`clinic_profile.timezone`, default CLINIC_DEFAULT_TZ), not the
 * server's. Open/close are resolved to absolute instants via the DST-aware
 * `parseOdDateTime`; slot labels are rendered in the clinic's zone. All slot
 * instants (`startIso`) are absolute, so the booking submission stays correct
 * regardless of the patient's browser timezone.
 *
 * Slot granularity is 30 minutes for v1.
 */

export const SLOT_MINUTES = 30
const SLOT_MS = SLOT_MINUTES * 60_000

export interface BookingSlot {
  /** ISO datetime — the start of this slot (absolute instant). */
  startIso: string
  /** Render label in the clinic's timezone, e.g. "8:00 AM". */
  label: string
  /** Slot is open: clinic is open at this time and nothing is on the books. */
  available: boolean
}

export type SlotsClosedReason =
  /** Clinic's hours for this day are null/closed (e.g. Sunday). */
  | 'day_closed'
  /** Clinic was open today but the current time is past closing — no future slots remain. */
  | 'past_closing'
  /** Hours config exists but is malformed (open/close strings unparseable). */
  | 'invalid_hours'

export interface SlotsForDay {
  slots: BookingSlot[]
  /** Set when `slots` is empty due to a closed-day or past-closing condition. */
  closedReason: SlotsClosedReason | null
}

interface HourEntry {
  open?: string | null
  close?: string | null
  closed?: boolean
}
type HoursMap = Record<string, HourEntry | undefined>

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

function parseHHMM(s: string): { h: number; m: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s)
  if (!match) return null
  return { h: parseInt(match[1], 10), m: parseInt(match[2], 10) }
}

/** Format an absolute instant as a "9:00 AM" label in the clinic's timezone. */
function fmtLabel(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(d)
}

/**
 * Returns the 30-min slot grid for a given day at the given clinic plus
 * an explanatory `closedReason` when the list is empty. The reason lets
 * the booking UI render the right copy: "we're closed on Sundays" vs.
 * "no more openings today — try tomorrow" are very different signals to
 * a patient.
 *
 * `date` accepts a date-only `YYYY-MM-DD` key (the public booking UI sends the
 * patient's selected calendar day) OR a `Date` (reschedule guard /
 * isSlotAvailable) — a Date is converted to the clinic-local calendar date.
 *
 * `excludeAppointmentId` lets the reschedule flow ignore the appointment
 * being moved so its current slot still appears as available.
 */
export async function getSlotsForDay(
  organizationId: string,
  date: Date | string,
  excludeAppointmentId?: string,
): Promise<SlotsForDay> {
  const [profile] = await db
    .select({ hours: clinicProfile.hours, timezone: clinicProfile.timezone })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)

  const timeZone = profile?.timezone?.trim() || CLINIC_DEFAULT_TZ
  const hours = (profile?.hours ?? {}) as HoursMap

  // Resolve the clinic-local calendar date (YYYY-MM-DD). A date-only string is
  // used as-is; a Date is converted to the clinic's local date so the weekday
  // + open/close are computed in the clinic's zone, not the server's (UTC).
  const dateKey =
    typeof date === 'string' && DATE_KEY_RE.test(date)
      ? date
      : formatOdDate(date instanceof Date ? date : new Date(date), timeZone)

  const entry = hours[DAY_KEYS[dayOfWeekForDateKey(dateKey)]]
  if (!entry || entry.closed || !entry.open || !entry.close) {
    return { slots: [], closedReason: 'day_closed' }
  }

  const openParts = parseHHMM(entry.open)
  const closeParts = parseHHMM(entry.close)
  if (!openParts || !closeParts) {
    return { slots: [], closedReason: 'invalid_hours' }
  }

  // Open/close as absolute instants, interpreting the clinic's wall-clock hours
  // in the clinic's timezone (DST-aware via parseOdDateTime's two-pass offset).
  const dayStart = parseOdDateTime(`${dateKey} ${entry.open}:00`, timeZone)
  const dayEnd = parseOdDateTime(`${dateKey} ${entry.close}:00`, timeZone)
  if (dayEnd.getTime() <= dayStart.getTime()) {
    return { slots: [], closedReason: 'invalid_hours' }
  }

  // Pull every appointment overlapping the day so we can flag taken slots.
  // The lower bound reaches back before `dayStart` so an appointment that
  // STARTS before opening but RUNS INTO the open window (e.g. an 8:30 visit
  // ending 9:30 when the clinic opens at 9:00) is still fetched and blocks the
  // overlapping slots. The 12-hour reach-back comfortably covers any single
  // visit's length; the precise overlap is still decided by `isBlocked` below.
  const fetchFrom = new Date(dayStart.getTime() - 12 * 60 * 60 * 1000)
  const baseFilters = [
    eq(appointment.organizationId, organizationId),
    gte(appointment.startTime, fetchFrom),
    lte(appointment.startTime, dayEnd),
  ]
  const filters = excludeAppointmentId
    ? [...baseFilters, ne(appointment.id, excludeAppointmentId)]
    : baseFilters
  const booked = await db
    .select({
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      status: appointment.status,
    })
    .from(appointment)
    .where(and(...filters))

  // Cancelled / no-show appointments don't block the slot — they're not
  // happening. Anything else (scheduled / confirmed / completed) does.
  const blocking = booked.filter(
    (b) => b.status !== 'cancelled' && b.status !== 'no_show',
  )

  function isBlocked(slotStart: Date): boolean {
    const slotEnd = new Date(slotStart.getTime() + SLOT_MS)
    return blocking.some((b) => {
      const bStart = new Date(b.startTime).getTime()
      const bEnd = b.endTime
        ? new Date(b.endTime).getTime()
        : bStart + SLOT_MS
      // Standard overlap check: slot overlaps if start < booked-end AND end > booked-start.
      return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart
    })
  }

  const now = Date.now()
  const slots: BookingSlot[] = []
  for (let t = dayStart.getTime(); t + SLOT_MS <= dayEnd.getTime(); t += SLOT_MS) {
    const slotStart = new Date(t)
    if (slotStart.getTime() < now) continue
    slots.push({
      startIso: slotStart.toISOString(),
      label: fmtLabel(slotStart, timeZone),
      available: !isBlocked(slotStart),
    })
  }
  // Empty list with no genuine close reason → the clinic was open, we just
  // crossed past closing time and filtered every remaining slot.
  const closedReason: SlotsClosedReason | null = slots.length === 0 ? 'past_closing' : null
  return { slots, closedReason }
}

/**
 * Convenience wrapper that returns just the slot array. Existing callers
 * (reschedule flow, race-condition guard) only care about the slots; the
 * booking UI uses `getSlotsForDay` directly so it can read closedReason.
 */
export async function getAvailableSlots(
  organizationId: string,
  date: Date | string,
  excludeAppointmentId?: string,
): Promise<BookingSlot[]> {
  const { slots } = await getSlotsForDay(organizationId, date, excludeAppointmentId)
  return slots
}

/**
 * Server-side guard: after a patient submits a booking, confirm the slot
 * is still actually free (someone else could have grabbed it in the
 * seconds between page load and form submit). Returns true when the
 * proposed `startTime` is still open in the same slot grid.
 */
export async function isSlotAvailable(
  organizationId: string,
  startTime: Date,
): Promise<boolean> {
  const slots = await getAvailableSlots(organizationId, startTime)
  const target = startTime.toISOString()
  return slots.some((s) => s.startIso === target && s.available)
}
