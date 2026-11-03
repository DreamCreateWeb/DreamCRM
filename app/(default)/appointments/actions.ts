'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { bulkCreateFollowups } from '@/lib/services/patient-followups'
import {
  confirmAppointment,
  cancelAppointment,
  markNoShow,
  markCompleted,
  rescheduleAppointment,
  createInternalAppointment,
  getAppointmentDetail,
  type CreateInternalAppointmentInput,
} from '@/lib/services/appointments'
import { getSlotsForDay, type BookingSlot } from '@/lib/services/booking'
import { createSavedView, deleteSavedView } from '@/lib/services/saved-views'
import {
  normalizeAppointmentViewFilters,
  appointmentViewFiltersToQuery,
  type AppointmentViewFilters,
} from '@/lib/types/appointment-views'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { sendBookingConfirmation, sendRescheduleNotice } from '@/lib/services/booking-confirmation'
import { sendReminderEmail, sendReminderSms } from '@/lib/services/reminder-automation'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { appointment } from '@/lib/db/schema/clinic'
import { listProviders, type ProviderRow } from '@/lib/services/providers'
import { searchPatientOptions, getPatientOption, type PatientOption } from '@/lib/services/patients'
import { resolveVisitTypes, visitTypeDuration, type VisitType } from '@/lib/types/visit-types'

/** Read the clinic's raw visit-type settings jsonb (null = defaults). */
async function getClinicVisitTypeSettings(organizationId: string): Promise<unknown> {
  const [row] = await db
    .select({ visitTypeSettings: clinicProfile.visitTypeSettings })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  return row?.visitTypeSettings ?? null
}

/**
 * The length of an EXISTING visit, for the slot guard: its own end time when
 * it has one, else the clinic's catalog duration for its type (the same
 * resolver a new booking uses). Null when the row is not this clinic's. ONE
 * home for both the reschedule guard and the reschedule drawer's slot grid,
 * so the grid can never offer a time the guard then refuses.
 */
async function resolveAppointmentDuration(
  organizationId: string,
  appointmentId: string,
): Promise<number | null> {
  const [row] = await db
    .select({ startTime: appointment.startTime, endTime: appointment.endTime, type: appointment.type })
    .from(appointment)
    .where(and(eq(appointment.organizationId, organizationId), eq(appointment.id, appointmentId)))
    .limit(1)
  if (!row) return null
  const fromEnd =
    row.endTime && row.startTime
      ? Math.round((new Date(row.endTime).getTime() - new Date(row.startTime).getTime()) / 60000)
      : 0
  if (fromEnd > 0) return fromEnd
  return visitTypeDuration(await getClinicVisitTypeSettings(organizationId), row.type)
}

async function requireClinicTenant() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Only clinic tenants can manage appointments')
  }
  return ctx
}

/** The "+ New booking" patient picker's search: name / email / phone digits,
 *  server-side, capped, most recently active first. Scoped to the caller's
 *  org exactly like every other patient read (tests/tenant-scoping). */
export async function searchPatientOptionsAction(query: string): Promise<PatientOption[]> {
  const ctx = await requireClinicTenant()
  return searchPatientOptions(ctx.organizationId, typeof query === 'string' ? query.slice(0, 80) : '')
}

export async function patientOptionByIdAction(patientId: string): Promise<PatientOption | null> {
  const ctx = await requireClinicTenant()
  if (typeof patientId !== 'string' || !patientId) return null
  return getPatientOption(ctx.organizationId, patientId.slice(0, 80))
}

export async function confirmAppointmentAction(appointmentId: string): Promise<{ ok: true }> {
  const ctx = await requireClinicTenant()
  await confirmAppointment(ctx.organizationId, appointmentId, 'manual')
  revalidatePath('/appointments')
  revalidatePath('/')
  revalidatePath('/my-day')
  return { ok: true }
}

export async function cancelAppointmentAction(appointmentId: string): Promise<{ ok: true }> {
  const ctx = await requireClinicTenant()
  await cancelAppointment(ctx.organizationId, appointmentId, {
    via: 'staff',
    userId: ctx.userId,
    name: ctx.userName,
  })
  revalidatePath('/appointments')
  revalidatePath('/')
  revalidatePath('/my-day')
  return { ok: true }
}

export async function markNoShowAction(appointmentId: string): Promise<{ ok: true }> {
  const ctx = await requireClinicTenant()
  await markNoShow(ctx.organizationId, appointmentId)
  revalidatePath('/appointments')
  revalidatePath('/')
  revalidatePath('/my-day')
  return { ok: true }
}

/** Put the visit's patient on the fast-pass list (wants an earlier time).
 *  Carries the visit's type + provider as the match criteria and links the
 *  visit so offers only fire for EARLIER slots. */
export async function addToWaitlistAction(appointmentId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireClinicTenant()
  const detail = await getAppointmentDetail(ctx.organizationId, appointmentId)
  if (!detail) return { ok: false, error: 'Visit not found.' }
  const { addToWaitlist } = await import('@/lib/services/appointment-waitlist')
  await addToWaitlist(ctx.organizationId, {
    patientId: detail.patient.id,
    visitType: detail.type,
    providerId: detail.providerId ?? null,
    appointmentId,
    source: 'staff',
  })
  revalidatePath('/appointments')
  return { ok: true }
}

export async function removeFromWaitlistAction(waitlistId: string): Promise<{ ok: true }> {
  const ctx = await requireClinicTenant()
  const { removeFromWaitlist } = await import('@/lib/services/appointment-waitlist')
  await removeFromWaitlist(ctx.organizationId, waitlistId)
  revalidatePath('/appointments')
  return { ok: true }
}

export interface MarkCompletedActionResult {
  ok: true
  reviewSent: boolean
  /** The next-visit facts (lib/services/appointments.ts MarkCompletedResult):
   *  `nextVisitBooked === false` is the toast's "Book next visit" door, the
   *  other three seed the booking drawer it opens. */
  patientId: string | null
  visitType: string | null
  nextVisitBooked: boolean
  nextVisitDateKey: string | null
}

export async function markCompletedAction(appointmentId: string): Promise<MarkCompletedActionResult> {
  const ctx = await requireClinicTenant()
  const r = await markCompleted(ctx.organizationId, appointmentId)
  revalidatePath('/appointments')
  revalidatePath('/')
  revalidatePath('/my-day')
  return {
    ok: true,
    reviewSent: r.reviewSent,
    patientId: r.patientId,
    visitType: r.visitType,
    nextVisitBooked: r.nextVisitBooked,
    nextVisitDateKey: r.nextVisitDateKey,
  }
}

/**
 * Bulk end-of-day reconciliation: mark the selected visits completed or
 * no-show in one pass (the front desk used to open each drawer one at a time).
 * Terminal-state guards (already cancelled/completed/no-show) throw per row —
 * we count those as skipped so one bad row never fails the whole batch.
 */
export async function bulkSetAppointmentStatusAction(
  ids: string[],
  status: 'completed' | 'no_show',
): Promise<{ ok: true; updated: number; skipped: number }> {
  const ctx = await requireClinicTenant()
  let updated = 0
  let skipped = 0
  for (const id of ids) {
    try {
      if (status === 'completed') await markCompleted(ctx.organizationId, id)
      else await markNoShow(ctx.organizationId, id)
      updated++
    } catch {
      skipped++
    }
  }
  revalidatePath('/appointments')
  revalidatePath('/')
  revalidatePath('/my-day')
  return { ok: true, updated, skipped }
}

export interface RescheduleResult { ok: true; newId: string }

export async function rescheduleAppointmentAction(input: {
  appointmentId: string
  newStartTime: string
  newEndTime?: string | null
  notifyPatient: boolean
}): Promise<RescheduleResult | { ok: false; error: string }> {
  const ctx = await requireClinicTenant()
  const start = new Date(input.newStartTime)
  if (Number.isNaN(start.getTime()) || start < new Date()) {
    return { ok: false, error: 'New start time must be in the future' }
  }
  // The moving visit's REAL length. The guard used to check the leading
  // 30-minute slot only, so a 60-minute visit moved to 4:30 before a 5:00
  // close passed, and a crown landed on top of the next chair's booking.
  const duration = await resolveAppointmentDuration(ctx.organizationId, input.appointmentId)
  if (duration == null) return { ok: false, error: 'Appointment not found' }
  // Same honest-error treatment as createInternalAppointmentAction;
  // exclude the appointment-being-rescheduled so its old slot doesn't
  // count as "taken" against itself, and span the whole visit.
  const { slots: rSlots, closedReason: rClosedReason } = await getSlotsForDay(
    ctx.organizationId, start, input.appointmentId, duration,
  )
  const rTargetIso = start.toISOString()
  const rSlot = rSlots.find((s) => s.startIso === rTargetIso)
  if (!rSlot || !rSlot.available) {
    const error =
      rClosedReason === 'day_closed' ? "We're closed that day. Pick another date." :
      rClosedReason === 'past_closing' ? "That time is past closing. Try a different time or day." :
      rClosedReason === 'invalid_hours' ? "Online booking isn't set up for this day — give us a call." :
      rSlot && !rSlot.available ? 'That slot conflicts with an existing appointment.' :
      "That time isn't an available slot. Pick another."
    return { ok: false, error }
  }
  // The new row's end follows the SAME length the guard just checked, so the
  // agenda shows what was reserved (a visit with no end time used to collapse
  // to a 30-minute block even when its type's catalog length was longer).
  const end = input.newEndTime ? new Date(input.newEndTime) : new Date(start.getTime() + duration * 60_000)
  const newId = await rescheduleAppointment({
    organizationId: ctx.organizationId,
    appointmentId: input.appointmentId,
    newStartTime: start,
    newEndTime: end,
  })

  // Best-effort patient notification — we don't fail the reschedule if email
  // delivery fails. The reschedule is the source of truth; comms is async.
  // The copy is the clinic-editable `rescheduled` email (Emails hub) with the
  // one-click "Confirm my new time" button; the CommLog mirror rides inside.
  if (input.notifyPatient) {
    try {
      const sender = await getClinicSenderIdentity(ctx.organizationId)
      await sendRescheduleNotice(ctx.organizationId, newId, sender)
    } catch (err) {
      console.warn('[reschedule] notify failed', err)
    }
  }

  revalidatePath('/appointments')
  revalidatePath('/')
  revalidatePath('/my-day')
  return { ok: true, newId }
}

type ReminderResult = { ok: true } | { ok: false; error: string }

/**
 * Core reminder send for an ALREADY-resolved clinic context. Internal helper
 * (not a server action) so bulk send authorizes once instead of re-running
 * requireClinicTenant — and three extra session/org/member queries — per row.
 * Callers own revalidation.
 */
async function sendReminderForOrg(
  ctx: { organizationId: string; organizationName: string; userId: string },
  appointmentId: string,
  channel: 'sms' | 'email',
  opts: {
    /** A deliberate single send may reach a CONFIRMED visit: the compose path
     *  renders the gentler 'appointment_reminder_confirmed' copy for it (no
     *  confirm ask; its own on/off in the Emails hub, whose refusal comes
     *  back worded truthfully). Bulk never passes this — "select all → Send
     *  reminders" keeps skipping confirmed rows. */
    allowConfirmed?: boolean
  } = {},
): Promise<ReminderResult> {
  const detail = await getAppointmentDetail(ctx.organizationId, appointmentId)
  if (!detail) return { ok: false, error: 'Appointment not found' }
  if (detail.status === 'cancelled' || detail.status === 'no_show') {
    return { ok: false, error: `Cannot send a reminder for a ${detail.status === 'no_show' ? 'no-show' : 'cancelled'} appointment` }
  }
  // A completed visit has nothing to be reminded of. A confirmed one is only
  // refused on the BULK path — the unconfirmed template asks "Reply CONFIRM",
  // so a bulk blast skips rows that already did; the drawer's single send
  // passes allowConfirmed and gets the confirmed variant instead.
  // "Cannot send" is matched by the bulk handler → counted as skipped, not an
  // error, so a "select all → Send reminder" quietly skips confirmed rows.
  if (detail.status === 'completed' || (detail.status === 'confirmed' && !opts.allowConfirmed)) {
    return { ok: false, error: `Cannot send a reminder — this appointment is already ${detail.status}` }
  }

  // Shared compose + send + commlog + audit-log paths, reused by the automated
  // reminder engine (lib/services/reminder-automation.ts) so the two can't drift.
  const sender = await getClinicSenderIdentity(ctx.organizationId)
  if (channel === 'sms') {
    // Works only for a clinic whose own texting is live (deliverSms enforces
    // the approved-only law, no platform fallback) — the honest refusal
    // comes back as the error message otherwise.
    const r = await sendReminderSms(ctx.organizationId, detail, sender, ctx.userId)
    return r.ok ? r : { ok: false, error: r.error }
  }
  if (!detail.patient.email) return { ok: false, error: 'Patient has no email on file' }
  return sendReminderEmail(ctx.organizationId, detail, sender, ctx.userId)
}

export async function sendReminderAction(
  appointmentId: string,
  channel: 'sms' | 'email' = 'email',
): Promise<ReminderResult> {
  const ctx = await requireClinicTenant()
  // The drawer's one deliberate send: a confirmed visit gets the see-you-soon
  // variant rather than a guaranteed refusal.
  const r = await sendReminderForOrg(ctx, appointmentId, channel, { allowConfirmed: true })
  if (r.ok) revalidatePath('/appointments')
  return r
}

export interface BulkSendResult {
  attempted: number
  sent: number
  skipped: number
  errors: Array<{ appointmentId: string; error: string }>
}

export async function bulkSendRemindersAction(
  appointmentIds: string[],
  channel: 'sms' | 'email' = 'email',
): Promise<BulkSendResult> {
  const ctx = await requireClinicTenant()
  const result: BulkSendResult = {
    attempted: appointmentIds.length,
    sent: 0,
    skipped: 0,
    errors: [],
  }
  for (const id of appointmentIds) {
    const r = await sendReminderForOrg(ctx, id, channel)
    if (r.ok) {
      result.sent += 1
    } else if (r.error.includes('no email') || r.error.includes('Cannot send')) {
      // No-email + cancelled/no-show rows are intentionally-skipped, not
      // errors. Bulk-send toast surfaces them under "skipped N" so the
      // user understands those rows didn't fail — they're just out of scope.
      result.skipped += 1
    } else {
      result.errors.push({ appointmentId: id, error: r.error })
    }
  }
  revalidatePath('/appointments')
  return result
}

export async function createInternalAppointmentAction(input: {
  patientId: string
  startTime: string
  type?: string
  providerId?: string | null
  durationMinutes?: number | null
  notes?: string | null
  /** "Walk-in (already here)" — skips the future-time + slot-availability
   *  guards so the front desk can log a now/earlier-today visit. */
  allowPast?: boolean
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await requireClinicTenant()
  const start = new Date(input.startTime)
  if (Number.isNaN(start.getTime())) {
    return { ok: false, error: 'Pick a valid date + time' }
  }
  const walkIn = input.allowPast === true
  if (!walkIn && start < new Date()) {
    return { ok: false, error: 'Appointment time must be in the future' }
  }
  // Resolve the visit-type duration from the clinic catalog when the caller
  // didn't pass an explicit one, so endTime + the slot-window check are right.
  const settings = await getClinicVisitTypeSettings(ctx.organizationId)
  const duration =
    input.durationMinutes && input.durationMinutes > 0
      ? input.durationMinutes
      : visitTypeDuration(settings, input.type)
  // Walk-ins bypass the slot grid entirely (the patient is physically present —
  // we're recording reality, not reserving a future opening).
  if (!walkIn) {
    // Honest error per closedReason — "conflicts with existing" is wrong
    // when the actual cause is a closed day or past closing. The full visit
    // duration is checked against the clinic's chair count.
    const { slots, closedReason } = await getSlotsForDay(ctx.organizationId, start, undefined, duration)
    const targetIso = start.toISOString()
    const slot = slots.find((s) => s.startIso === targetIso)
    if (!slot || !slot.available) {
      const error =
        closedReason === 'day_closed' ? "We're closed that day. Pick another date." :
        closedReason === 'past_closing' ? "That time is past closing. Try a different time or day." :
        closedReason === 'invalid_hours' ? "Online booking isn't set up for this day — give us a call." :
        slot && !slot.available ? 'Every chair is booked at that time. Pick another slot.' :
        "That time isn't an available slot. Pick another."
      return { ok: false, error }
    }
  }
  const create: CreateInternalAppointmentInput = {
    organizationId: ctx.organizationId,
    patientId: input.patientId,
    startTime: start,
    type: input.type,
    providerId: input.providerId ?? null,
    durationMinutes: duration,
    notes: input.notes ?? null,
    source: 'manual',
  }
  try {
    const id = await createInternalAppointment(create)
    // Confirm the patient the same way the public widget does — they were
    // just booked without self-initiating, so they should hear about it.
    // Walk-ins skip the "you're booked" email (they're already in the chair).
    if (!walkIn) {
      await sendBookingConfirmation({
        organizationId: ctx.organizationId,
        patientId: input.patientId,
        appointmentType: input.type ?? 'cleaning',
        startTime: start,
      })
    }
    revalidatePath('/appointments')
    revalidatePath(`/patients/${input.patientId}`)
    revalidatePath('/')
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export interface BookingConfig {
  providers: Array<{ id: string; displayName: string; role: string }>
  visitTypes: Array<{ id: string; label: string; durationMinutes: number }>
}

/**
 * Front-desk booking drawer config: active providers + the clinic's visit-type
 * catalog. Lets the drawer offer a provider select + a visit-type select that
 * carries each type's duration. Org-scoped via requireClinicTenant.
 */
export async function getBookingConfigAction(): Promise<BookingConfig> {
  const ctx = await requireClinicTenant()
  const [providers, settings] = await Promise.all([
    listProviders(ctx.organizationId, { activeOnly: true }),
    getClinicVisitTypeSettings(ctx.organizationId),
  ])
  return {
    providers: providers.map((p: ProviderRow) => ({ id: p.id, displayName: p.displayName, role: p.role })),
    visitTypes: resolveVisitTypes(settings).map((t: VisitType) => ({
      id: t.id,
      label: t.label,
      durationMinutes: t.durationMinutes,
    })),
  }
}

/**
 * Slot grid for the front-desk drawer's date+duration. Mirrors the public
 * `listBookingSlots` but is gated to the clinic tenant. Accepts a date-only
 * 'YYYY-MM-DD' key (clinic-zone) and an optional visit duration so the
 * availability check spans the whole appointment against the chair count.
 *
 * `excludeAppointmentId` is the RESCHEDULE case: the moving visit's own slot
 * must not count as taken against itself, and when no duration is passed its
 * length is resolved from that very row — the same resolver the reschedule
 * guard uses, so the grid and the guard agree.
 */
export async function getBookingSlotsAction(
  dateKey: string,
  durationMinutes?: number,
  excludeAppointmentId?: string,
): Promise<BookingSlot[]> {
  const ctx = await requireClinicTenant()
  if (!dateKey) return []
  const exclude = typeof excludeAppointmentId === 'string' && excludeAppointmentId ? excludeAppointmentId : undefined
  const duration =
    durationMinutes && durationMinutes > 0
      ? durationMinutes
      : exclude
        ? (await resolveAppointmentDuration(ctx.organizationId, exclude)) ?? undefined
        : undefined
  const { slots } = await getSlotsForDay(ctx.organizationId, dateKey, exclude, duration)
  return slots
}

// ── Saved views (the agenda's named filter combos) ─────────────────────────

/** Save (or overwrite by name) the current agenda filters as a named view. */
export async function createAppointmentViewAction(
  name: string,
  rawFilters: AppointmentViewFilters,
): Promise<{ ok: true; view: { id: string; name: string; query: string } } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can save views' }
  try {
    const filters = normalizeAppointmentViewFilters(rawFilters as Record<string, unknown>)
    const row = await createSavedView(ctx.organizationId, 'appointments', name, filters as Record<string, unknown>, ctx.userId)
    return { ok: true, view: { id: row.id, name: row.name, query: appointmentViewFiltersToQuery(filters) } }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save the view' }
  }
}

/** Delete a saved agenda view. */
export async function deleteAppointmentViewAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can delete views' }
  try {
    await deleteSavedView(ctx.organizationId, id)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not delete the view' }
  }
}

/** In-office flow: arrived → seated (reset for mis-taps). Today's agenda +
 *  the drawer call this; My Day mirrors the chips read-only. */
export async function setArrivalStateAction(
  appointmentId: string,
  state: 'arrived' | 'seated' | 'reset',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireClinicTenant()
  const { setArrivalState } = await import('@/lib/services/appointments')
  const r = await setArrivalState(ctx.organizationId, appointmentId, state)
  if (r.ok) {
    revalidatePath('/appointments')
    revalidatePath('/my-day')
  }
  return r
}

/** Create one follow-up per (deduped, org-owned) patient from an explicit id
 *  list — the agenda "follow up with these N patients" bulk action (e.g.
 *  everyone who no-showed today). Lives here because the agenda bulk bar is
 *  its only UI (moved from patients/actions.ts in the structure pass). */
export async function bulkCreateFollowupsForPatientsAction(
  patientIds: string[],
  input: { title: string; dueDate?: string | null },
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can add follow-ups' }
  if (!input.title.trim()) return { ok: false, error: 'Give the follow-up a title.' }
  try {
    const { created } = await bulkCreateFollowups(ctx.organizationId, patientIds, input, ctx.userId)
    revalidatePath('/followups')
    revalidatePath('/dashboard')
    return { ok: true, created }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not add follow-ups' }
  }
}
