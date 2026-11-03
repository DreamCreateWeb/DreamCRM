import { CLINIC_DEFAULT_TZ, clinicDayStart, clinicLocalHour, resolveClinicTimeZone } from '@/lib/clinic-timezone'

/**
 * REMINDER HOURS — when a reminder may leave, and when a booking is too
 * fresh to nag. Pure: no DB, no server-only. The reminder engine
 * (lib/services/reminder-automation.ts), the SMS transport (lib/sms.ts),
 * the agenda's "booked just now" glyph and the settings sentence all read
 * the SAME constants from here, so none of them can drift.
 *
 * RULE 1 — THE SEND WINDOW. Nothing texts or emails a patient at 11 PM.
 * Every reminder channel is gated on the CLINIC-LOCAL hour: the server runs
 * in UTC, so a reminder whose offset opens at 23:10 Central reads as 04:10
 * "tomorrow" on the server clock and would go out at 23:10. The hour comes
 * from Intl via `clinicLocalHour` (DST-correct), never from
 * `new Date().getHours()`. The window is 8:00–20:00 in the clinic's
 * timezone — 8 AM inclusive, 8 PM exclusive — and it is FIXED: no setting
 * in this slice. (TCPA's own window is 8 AM–9 PM local; we stop an hour
 * early on purpose. A dental reminder at 8:45 PM is legal and still
 * unwelcome.)
 *
 * A candidate outside the window is simply NOT DUE YET. It is not marked
 * sent, not logged, not claimed. The engine's dedupe keys — the per-touch
 * log row and the min-gap read — only ever see what actually went out, so
 * the first tick inside the window finds the candidate with nothing to
 * swallow it. Mind the offset arithmetic: a 9 AM visit's 24h touch opens at
 * 9 AM the day before — inside the window, it goes then. A 7 AM visit's
 * opens at 7 AM — outside, so it goes at the 8 AM tick (hoursUntil is 23 by
 * then, still the 24h touch). A 7 AM visit's 2h touch opens at 5 AM and
 * never goes: by 8 AM the visit has started, and the day-before touch
 * already covered it. That is the law working, not a gap.
 *
 * RULE 2 — JUST BOOKED. A booking confirmation carries everything a
 * reminder would: the date, the time, the one-click confirm link. So a
 * visit booked minutes ago must not be reminded on the next cron tick — and
 * the touch whose window the visit was BORN INSIDE (already open when it
 * was booked: the 24h touch of a visit booked 20 hours out) is never due at
 * all, because the confirmation WAS that touch. Later touches — the 24h
 * touch of a visit booked three days out, the 2h-before of one booked this
 * morning — fire as normal once their own window opens, except during the
 * first JUST_BOOKED_GRACE_HOURS after booking, when nothing follows the
 * confirmation at all (a touch whose window opens thirty minutes after the
 * booking waits for the grace to pass). Skipped means skipped: no log row,
 * no claim — a later touch is still this visit's.
 *
 * The rule holds only when a confirmation actually went out, and the
 * engine keeps no per-visit record of one, so `confirmationCoversBooking`
 * is the honest proxy: lib/services/booking-confirmation.ts returns early
 * without the patient's OWN email (a dependent reminded at a guardian's
 * address, a phone-only patient — neither was confirmed), and a PMS-synced
 * visit (source 'pms' / 'pms_import') was booked in the practice system —
 * we confirmed nothing, so the reminder is the first thing that patient
 * hears from us and goes exactly as before.
 */

const HOUR_MS = 60 * 60 * 1000

/** The send window, clinic-local hours: `startHour` inclusive, `endHour` exclusive. */
export interface SendWindow {
  startHour: number
  endHour: number
}

export const SEND_WINDOW_START_HOUR = 8
export const SEND_WINDOW_END_HOUR = 20

export const DEFAULT_SEND_WINDOW: SendWindow = {
  startHour: SEND_WINDOW_START_HOUR,
  endHour: SEND_WINDOW_END_HOUR,
}

/** `8` → "8 AM", `20` → "8 PM", `0` → "12 AM" — the settings sentence and
 *  the transport's refusal quote the window through this, so the words
 *  can never disagree with the gate. */
export function formatHour12(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve} ${h < 12 ? 'AM' : 'PM'}`
}

/** The clinic-local hour, defensively: an unparseable stored timezone must
 *  never throw out of a cron loop (one clinic must never silence the tick),
 *  so it reads on the platform default instead. */
function safeLocalHour(now: Date, timeZone: string | null | undefined): number {
  try {
    return clinicLocalHour(now, timeZone)
  } catch {
    return clinicLocalHour(now, CLINIC_DEFAULT_TZ)
  }
}

/**
 * Is `now` inside the send window on the clinic's own clock? Read from
 * Intl (DST-correct), never from the server's hour.
 */
export function isInsideSendWindow(
  now: Date,
  timeZone: string | null | undefined,
  window: SendWindow = DEFAULT_SEND_WINDOW,
): boolean {
  const hour = safeLocalHour(now, timeZone)
  return hour >= window.startHour && hour < window.endHour
}

/** The instant of `hour`:00 on the clinic-local day `dayOffset` days from
 *  the one containing `now`. Local midnight plus elapsed hours is wrong on
 *  a DST day (spring-forward's midnight + 8h reads 9:00 on the wall,
 *  fall-back's reads 7:00), so the wall-clock drift is read back through
 *  Intl and corrected. */
function clinicWallClockHour(now: Date, timeZone: string, dayOffset: number, hour: number): Date {
  const midnight = clinicDayStart(now, timeZone, dayOffset)
  const candidate = new Date(midnight.getTime() + hour * HOUR_MS)
  const drift = clinicLocalHour(candidate, timeZone) - hour
  return drift === 0 ? candidate : new Date(candidate.getTime() - drift * HOUR_MS)
}

/**
 * The earliest instant at or after `now` when a send is allowed: `now`
 * itself inside the window; otherwise the next opening — today's if the
 * clinic's clock has not reached it yet, tomorrow's once it has closed.
 */
export function nextWindowOpen(
  now: Date,
  timeZone: string | null | undefined,
  window: SendWindow = DEFAULT_SEND_WINDOW,
): Date {
  if (isInsideSendWindow(now, timeZone, window)) return now
  let tz = resolveClinicTimeZone(timeZone)
  try {
    clinicLocalHour(now, tz)
  } catch {
    tz = CLINIC_DEFAULT_TZ
  }
  const hour = clinicLocalHour(now, tz)
  return clinicWallClockHour(now, tz, hour < window.startHour ? 0 : 1, window.startHour)
}

// ── Rule 2: just booked ─────────────────────────────────────────────────────

/** How long after a booking NOTHING follows the confirmation. */
export const JUST_BOOKED_GRACE_HOURS = 2

/**
 * The agenda's "booked just now" glyph window (lib/services/appointments.ts
 * reads it back from here). The display twin of the grace, deliberately
 * shorter: a glyph is a nudge to the desk, the grace is a courtesy to the
 * patient. One home so neither drifts without the other being looked at.
 */
export const JUST_BOOKED_MS = 60 * 60 * 1000

/** Was the touch at `offsetHours` already open when the visit was booked?
 *  Then the booking confirmation WAS that touch. Unknown `createdAt`
 *  (a slim fixture, a legacy row) never claims so. */
export function bornInsideTouch(
  createdAt: Date | null | undefined,
  startTime: Date,
  offsetHours: number,
): boolean {
  if (!createdAt) return false
  return startTime.getTime() - createdAt.getTime() <= offsetHours * HOUR_MS
}

/**
 * The just-booked rule for one (visit, touch) pair: true means "not due —
 * the confirmation covers it". Within the grace every touch waits; after
 * it, only the touch the visit was born inside stays covered.
 */
export function bookedTooRecently(input: {
  createdAt: Date | null | undefined
  startTime: Date
  now: Date
  offsetHours: number
}): boolean {
  if (!input.createdAt) return false
  if (input.now.getTime() - input.createdAt.getTime() < JUST_BOOKED_GRACE_HOURS * HOUR_MS) return true
  return bornInsideTouch(input.createdAt, input.startTime, input.offsetHours)
}

/** Appointment sources the practice system wrote — we sent no confirmation. */
const PMS_SOURCES: ReadonlySet<string> = new Set(['pms', 'pms_import'])

/**
 * Did a booking confirmation go out for this visit? The honest proxy (see
 * the header): the platform booked it, and the patient has an address of
 * their own for the confirmation to have reached.
 */
export function confirmationCoversBooking(input: {
  source: string | null | undefined
  patientEmail: string | null | undefined
}): boolean {
  if (input.source && PMS_SOURCES.has(input.source)) return false
  return !!input.patientEmail?.trim()
}
