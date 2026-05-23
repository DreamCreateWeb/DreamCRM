import 'server-only'
import { and, eq, gte, lte, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appointment } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'

/**
 * Public-site booking availability service. Computes the slot grid for a
 * given day based on (a) the clinic's configured hours and (b) appointments
 * already on the books. Returns 30-minute slots within the clinic's open
 * window, marking each as available or taken.
 *
 * Slot granularity is 30 minutes for the v1 — dental appointments span
 * roughly 30-60 minutes for hygiene + most general procedures, so 30-min
 * granularity hits the right user expectation. Configurable later.
 */

export const SLOT_MINUTES = 30
const SLOT_MS = SLOT_MINUTES * 60_000

export interface BookingSlot {
  /** ISO datetime — the start of this slot. */
  startIso: string
  /** Render label, e.g. "8:00 AM". */
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
function dayKey(d: Date): (typeof DAY_KEYS)[number] {
  return DAY_KEYS[d.getDay()]
}

function parseHHMM(s: string): { h: number; m: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s)
  if (!match) return null
  return { h: parseInt(match[1], 10), m: parseInt(match[2], 10) }
}

function fmtLabel(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

/**
 * Returns the 30-min slot grid for a given day at the given clinic plus
 * an explanatory `closedReason` when the list is empty. The reason lets
 * the booking UI render the right copy: "we're closed on Sundays" vs.
 * "no more openings today — try tomorrow" are very different signals to
 * a patient.
 *
 * `excludeAppointmentId` lets the reschedule flow ignore the appointment
 * being moved so its current slot still appears as available.
 */
export async function getSlotsForDay(
  organizationId: string,
  date: Date,
  excludeAppointmentId?: string,
): Promise<SlotsForDay> {
  const [profile] = await db
    .select({ hours: clinicProfile.hours })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)

  const hours = (profile?.hours ?? {}) as HoursMap
  const entry = hours[dayKey(date)]
  if (!entry || entry.closed || !entry.open || !entry.close) {
    return { slots: [], closedReason: 'day_closed' }
  }

  const openParts = parseHHMM(entry.open)
  const closeParts = parseHHMM(entry.close)
  if (!openParts || !closeParts) {
    return { slots: [], closedReason: 'invalid_hours' }
  }

  const dayStart = new Date(date)
  dayStart.setHours(openParts.h, openParts.m, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(closeParts.h, closeParts.m, 0, 0)
  if (dayEnd.getTime() <= dayStart.getTime()) {
    return { slots: [], closedReason: 'invalid_hours' }
  }

  // Pull every appointment overlapping the day so we can flag taken slots.
  const baseFilters = [
    eq(appointment.organizationId, organizationId),
    gte(appointment.startTime, dayStart),
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
      label: fmtLabel(slotStart),
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
  date: Date,
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
