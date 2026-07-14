import 'server-only'
import { and, eq, gte, lte, ne, sql } from 'drizzle-orm'
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

/** Clamp a stored `clinic_profile.chair_count` into 1..20. Null/invalid → 1
 *  so clinics set up before the column existed keep single-chair behavior. */
export function normalizeChairCount(raw: number | null | undefined): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 1
  return Math.min(20, Math.max(1, Math.floor(n)))
}

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
  /** When booking a longer visit, the availability check spans the whole
   *  duration (not just the leading 30-min slot). Defaults to one slot so the
   *  public picker keeps showing 30-min start times. */
  durationMinutes?: number,
  /** Patient-facing notice window ("Earliest online booking", Settings →
   *  Patient portal): slots inside now+N hours are dropped. Pass ONLY from
   *  patient-facing callers (public site + portal) — staff booking paths omit
   *  it so the front desk can always book a walk-in right now. */
  minNoticeHours?: number,
): Promise<SlotsForDay> {
  const [profile] = await db
    .select({
      hours: clinicProfile.hours,
      timezone: clinicProfile.timezone,
      chairCount: clinicProfile.chairCount,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)

  const timeZone = profile?.timezone?.trim() || CLINIC_DEFAULT_TZ
  const hours = (profile?.hours ?? {}) as HoursMap
  // How many patients the clinic can see at once (operatories / chairs). Null
  // or invalid → 1, which preserves the original single-chair behavior where
  // ANY overlapping appointment blocks the slot.
  const chairCount = normalizeChairCount(profile?.chairCount)

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

  // Count appointments overlapping a [start, end) window. A multi-chair clinic
  // only "fills" a slot once the overlap count reaches its chair count, so a
  // 3-chair practice can take 3 simultaneous bookings; the 4th is blocked.
  // `windowMs` lets a longer visit (a 60-min root canal) check its whole span,
  // not just the leading 30-min slot.
  function overlapCount(slotStart: Date, windowMs = SLOT_MS): number {
    const slotStartMs = slotStart.getTime()
    const slotEndMs = slotStartMs + windowMs
    let n = 0
    for (const b of blocking) {
      const bStart = new Date(b.startTime).getTime()
      const bEnd = b.endTime ? new Date(b.endTime).getTime() : bStart + SLOT_MS
      // Standard overlap check: windows overlap if start < other-end AND end > other-start.
      if (slotStartMs < bEnd && slotEndMs > bStart) n += 1
    }
    return n
  }

  function isBlocked(slotStart: Date, windowMs = SLOT_MS): boolean {
    return overlapCount(slotStart, windowMs) >= chairCount
  }

  const windowMs =
    durationMinutes && Number.isFinite(durationMinutes) && durationMinutes > 0
      ? Math.max(SLOT_MS, Math.round(durationMinutes) * 60_000)
      : SLOT_MS
  const now = Date.now()
  // The patient-facing floor: the later of "now" and "now + notice window".
  const earliestBookable =
    minNoticeHours && Number.isFinite(minNoticeHours) && minNoticeHours > 0
      ? now + minNoticeHours * 3_600_000
      : now
  const slots: BookingSlot[] = []
  for (let t = dayStart.getTime(); t + SLOT_MS <= dayEnd.getTime(); t += SLOT_MS) {
    const slotStart = new Date(t)
    if (slotStart.getTime() < earliestBookable) continue
    // The WHOLE visit must fit before closing — not just the leading 30-min
    // slot. A 60-min visit at 16:30 (close 17:00) would otherwise read as
    // available and book a patient into hours the clinic isn't staffed.
    const fitsBeforeClose = t + windowMs <= dayEnd.getTime()
    slots.push({
      startIso: slotStart.toISOString(),
      label: fmtLabel(slotStart, timeZone),
      available: fitsBeforeClose && !isBlocked(slotStart, windowMs),
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
  durationMinutes?: number,
  minNoticeHours?: number,
): Promise<BookingSlot[]> {
  const { slots } = await getSlotsForDay(organizationId, date, excludeAppointmentId, durationMinutes, minNoticeHours)
  return slots
}

/**
 * Whether the clinic has ANY bookable slot across the next `days` calendar days
 * starting from `fromDateKey` (a `YYYY-MM-DD` clinic-local day). Used by the
 * public booking widget to decide whether to surface a prominent "call us"
 * fallback when the entire visible window is closed or fully booked (vs. just
 * a single empty day). Stops at the first available slot it finds, so the
 * common case (availability soon) returns fast.
 *
 * `durationMinutes` makes the check respect the visit length (a longer visit
 * may have no fit even when 30-min starts exist).
 */
export async function hasBookableSlotsInWindow(
  organizationId: string,
  fromDateKey: string,
  days = 14,
  durationMinutes?: number,
): Promise<boolean> {
  if (!DATE_KEY_RE.test(fromDateKey)) return false
  const [y, m, d] = fromDateKey.split('-').map((n) => parseInt(n, 10))
  // Step the calendar day via a UTC anchor (date-only math is zone-agnostic —
  // we only ever read Y-M-D back out, never an instant).
  const anchor = Date.UTC(y, m - 1, d)
  for (let i = 0; i < Math.max(1, days); i++) {
    const day = new Date(anchor + i * 86_400_000)
    const key = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`
    const { slots } = await getSlotsForDay(organizationId, key, undefined, durationMinutes)
    if (slots.some((s) => s.available)) return true
  }
  return false
}

/**
 * Server-side guard: after a patient submits a booking, confirm the slot
 * is still actually free (someone else could have grabbed it in the
 * seconds between page load and form submit). Returns true when the
 * proposed `startTime` is still open in the same slot grid.
 *
 * `durationMinutes` checks the whole visit span against the chair count, so a
 * 60-min visit isn't approved when only the first 30 minutes happen to be free.
 * `excludeAppointmentId` ignores the appointment being moved (reschedule guard).
 */
export async function isSlotAvailable(
  organizationId: string,
  startTime: Date,
  durationMinutes?: number,
  excludeAppointmentId?: string,
  /** Patient-facing notice window — see getSlotsForDay. Staff paths omit it. */
  minNoticeHours?: number,
): Promise<boolean> {
  const slots = await getAvailableSlots(organizationId, startTime, excludeAppointmentId, durationMinutes, minNoticeHours)
  const target = startTime.toISOString()
  return slots.some((s) => s.startIso === target && s.available)
}

/**
 * Atomically book a slot, closing the check-then-insert race: `isSlotAvailable`
 * (read) and the appointment INSERT (write) were separate statements, so two
 * near-simultaneous submissions for the last open slot at a single-chair clinic
 * could both pass the check and both insert (a double-book — the exact thing the
 * chair logic exists to prevent).
 *
 * We take a transaction-scoped Postgres ADVISORY LOCK keyed on org+slot, so
 * concurrent bookings for the SAME slot serialize, then RE-CHECK availability
 * under the lock before inserting. The second booker now sees the first's
 * committed appointment and is turned away. The lock key hashes org+slot — a
 * hash collision only causes harmless extra serialization between two unrelated
 * slots, never an incorrect result.
 *
 * Returns true when the appointment was inserted, false when the slot was taken
 * under the lock (the caller surfaces "pick another time"). A multi-chair clinic
 * still allows up to `chairCount` concurrent bookings — the re-check honors it.
 */
export async function insertAppointmentIfSlotFree(
  organizationId: string,
  startTime: Date,
  durationMinutes: number | undefined,
  values: typeof appointment.$inferInsert,
  excludeAppointmentId?: string,
): Promise<boolean> {
  const lockText = `appt:${organizationId}:${startTime.toISOString()}`
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockText}))`)
    const free = await isSlotAvailable(organizationId, startTime, durationMinutes, excludeAppointmentId)
    if (!free) return false
    await tx.insert(appointment).values(values)
    return true
  })
}
