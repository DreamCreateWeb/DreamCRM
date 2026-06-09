'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { appointment, patient } from '@/lib/db/schema/clinic'
import { requireTenant, type TenantContext } from '@/lib/auth/context'
import { getPortalSettings } from '@/lib/services/portal-settings'
import {
  getAccessiblePatientIds,
  getVisitForPatients,
  sendMessageFromPatient,
} from '@/lib/services/patient-portal'
import {
  confirmAppointment,
  cancelAppointment,
  rescheduleAppointment,
} from '@/lib/services/appointments'
import { getSlotsForDay, isSlotAvailable, SLOT_MINUTES, type SlotsForDay } from '@/lib/services/booking'
import { queueAppointmentWriteBack } from '@/lib/services/pms'
import { sendBookingConfirmation } from '@/lib/services/booking-confirmation'
import { PORTAL_VISIT_LABELS } from '@/lib/types/portal'

/**
 * Patient-side server actions for the portal. Every action:
 *   1. resolves the tenant and requires a patient context,
 *   2. scopes the target to the signed-in patient (+ linked dependents
 *      when family access is on),
 *   3. enforces the clinic's portal settings (feature flags + notice
 *      windows) server-side — the UI hides what's off, but the action is
 *      the real gate.
 *
 * Mutations reuse the same lifecycle services the front desk uses, so the
 * PMS write-back queue, terminal-state guards, and audit timestamps behave
 * identically regardless of who initiated the change.
 */

export type PortalActionResult = { ok: true } | { ok: false; error: string }

const HOUR_MS = 3_600_000

async function requirePatient(): Promise<TenantContext & { patientId: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient' || !ctx.patientId) {
    throw new Error('Only patients can use the portal')
  }
  return ctx as TenantContext & { patientId: string }
}

function revalidateVisits() {
  revalidatePath('/patient/dashboard')
  revalidatePath('/patient/appointments')
}

/** Slot lookup for the portal book + reschedule pickers. Read-only. */
export async function getPortalSlotsAction(dateKey: string): Promise<SlotsForDay> {
  const ctx = await requirePatient()
  return getSlotsForDay(ctx.organizationId, dateKey)
}

export async function confirmMyVisitAction(visitId: string): Promise<PortalActionResult> {
  const ctx = await requirePatient()
  const settings = await getPortalSettings(ctx.organizationId)
  const allowed = await getAccessiblePatientIds(ctx.patientId, ctx.organizationId, settings.features.family)
  const visit = await getVisitForPatients(visitId, allowed, ctx.organizationId)
  if (!visit) return { ok: false, error: 'We couldn’t find that visit.' }
  if (visit.status !== 'scheduled') return { ok: false, error: 'This visit doesn’t need confirming.' }

  try {
    await confirmAppointment(ctx.organizationId, visitId, 'portal')
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
  revalidateVisits()
  return { ok: true }
}

export async function cancelMyVisitAction(visitId: string): Promise<PortalActionResult> {
  const ctx = await requirePatient()
  const settings = await getPortalSettings(ctx.organizationId)
  if (!settings.features.reschedule) {
    return { ok: false, error: 'Online cancellation isn’t available — give us a call and we’ll take care of it.' }
  }
  const allowed = await getAccessiblePatientIds(ctx.patientId, ctx.organizationId, settings.features.family)
  const visit = await getVisitForPatients(visitId, allowed, ctx.organizationId)
  if (!visit) return { ok: false, error: 'We couldn’t find that visit.' }
  if (visit.status !== 'scheduled' && visit.status !== 'confirmed') {
    return { ok: false, error: 'This visit can’t be cancelled online.' }
  }

  const noticeMs = settings.reschedule.minNoticeHours * HOUR_MS
  if (visit.startTime.getTime() - Date.now() < noticeMs) {
    return {
      ok: false,
      error: `This visit is less than ${settings.reschedule.minNoticeHours} hours away — give us a quick call and we’ll sort it out together.`,
    }
  }

  try {
    await cancelAppointment(ctx.organizationId, visitId)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
  revalidateVisits()
  return { ok: true }
}

export async function rescheduleMyVisitAction(
  visitId: string,
  newStartIso: string,
): Promise<PortalActionResult> {
  const ctx = await requirePatient()
  const settings = await getPortalSettings(ctx.organizationId)
  if (!settings.features.reschedule) {
    return { ok: false, error: 'Online rescheduling isn’t available — give us a call and we’ll find you a time.' }
  }
  const allowed = await getAccessiblePatientIds(ctx.patientId, ctx.organizationId, settings.features.family)
  const visit = await getVisitForPatients(visitId, allowed, ctx.organizationId)
  if (!visit) return { ok: false, error: 'We couldn’t find that visit.' }
  if (visit.status !== 'scheduled' && visit.status !== 'confirmed') {
    return { ok: false, error: 'This visit can’t be moved online.' }
  }

  const noticeMs = settings.reschedule.minNoticeHours * HOUR_MS
  if (visit.startTime.getTime() - Date.now() < noticeMs) {
    return {
      ok: false,
      error: `This visit is less than ${settings.reschedule.minNoticeHours} hours away — give us a quick call and we’ll sort it out together.`,
    }
  }

  const newStart = new Date(newStartIso)
  if (isNaN(newStart.getTime()) || newStart.getTime() <= Date.now()) {
    return { ok: false, error: 'Pick a time in the future.' }
  }
  // The new slot must be a real opening (ignore the visit being moved so its
  // current time still counts as available).
  const { slots } = await getSlotsForDay(ctx.organizationId, newStart, visitId)
  const targetIso = newStart.toISOString()
  const free = slots.some((s) => s.startIso === targetIso && s.available)
  if (!free) return { ok: false, error: 'That time was just taken — pick another one.' }

  try {
    await rescheduleAppointment({
      organizationId: ctx.organizationId,
      appointmentId: visitId,
      newStartTime: newStart,
      newEndTime: null, // preserve original duration
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }

  // Same confirmation email a fresh booking gets — the patient ends up with
  // the new time in writing without us inventing a new template.
  await sendBookingConfirmation({
    organizationId: ctx.organizationId,
    patientId: visit.patientId,
    appointmentType: visit.type,
    startTime: newStart,
  })

  revalidateVisits()
  return { ok: true }
}

export async function bookMyVisitAction(formData: FormData): Promise<PortalActionResult> {
  const ctx = await requirePatient()
  const settings = await getPortalSettings(ctx.organizationId)
  if (!settings.features.booking) {
    return { ok: false, error: 'Online booking isn’t available — give us a call and we’ll find you a time.' }
  }

  const allowed = await getAccessiblePatientIds(ctx.patientId, ctx.organizationId, settings.features.family)
  // Booking for self by default; a guardian may book for a linked dependent.
  const forPatientId = formData.get('forPatientId')?.toString() || ctx.patientId
  if (!allowed.includes(forPatientId)) {
    return { ok: false, error: 'You can only book for yourself or your linked family members.' }
  }

  const type = formData.get('type')?.toString() || ''
  if (!settings.booking.allowedTypes.includes(type)) {
    return { ok: false, error: 'That visit type can’t be booked online — give us a call and we’ll set it up.' }
  }

  const startTimeRaw = formData.get('startTime')?.toString()
  const startTime = startTimeRaw ? new Date(startTimeRaw) : null
  if (!startTime || isNaN(startTime.getTime())) return { ok: false, error: 'Pick a time for your visit.' }
  if (startTime.getTime() < Date.now() + settings.booking.minNoticeHours * HOUR_MS) {
    return { ok: false, error: 'That time is too soon to book online — pick a later slot or give us a call.' }
  }

  const free = await isSlotAvailable(ctx.organizationId, startTime)
  if (!free) return { ok: false, error: 'That time was just taken — pick another one.' }

  const notes = formData.get('notes')?.toString().trim() || ''
  // The comfort question — Tend-style "positive anticipation". Lands in the
  // visit notes so the front desk actually sees it.
  const comfort = formData.get('comfort')?.toString().trim() || ''
  const combinedNotes =
    [notes, comfort ? `Comfort note: ${comfort}` : ''].filter(Boolean).join('\n') || null

  // Agenda title carries the visit-holder's name — matters when a guardian
  // books for a dependent (the booker isn't the patient in the chair).
  const label = PORTAL_VISIT_LABELS[type] ?? 'Visit'
  const [forPatient] = await db
    .select({ firstName: patient.firstName, lastName: patient.lastName })
    .from(patient)
    .where(and(eq(patient.id, forPatientId), eq(patient.organizationId, ctx.organizationId)))
    .limit(1)
  const patientName = forPatient ? `${forPatient.firstName} ${forPatient.lastName}` : ctx.userName

  const endTime = new Date(startTime.getTime() + SLOT_MINUTES * 60_000)
  const apptId = randomUUID()
  await db.insert(appointment).values({
    id: apptId,
    organizationId: ctx.organizationId,
    patientId: forPatientId,
    title: `${label} - ${patientName}`,
    startTime,
    endTime,
    type,
    status: 'scheduled',
    notes: combinedNotes,
    source: 'portal',
  })

  await queueAppointmentWriteBack(ctx.organizationId, apptId)
  await sendBookingConfirmation({
    organizationId: ctx.organizationId,
    patientId: forPatientId,
    appointmentType: type,
    startTime,
  })

  revalidateVisits()
  return { ok: true }
}

export async function sendPortalMessageAction(body: string): Promise<PortalActionResult> {
  const ctx = await requirePatient()
  const settings = await getPortalSettings(ctx.organizationId)
  if (!settings.features.messages) {
    return { ok: false, error: 'Messaging isn’t available — give us a call instead.' }
  }
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'Write a message first.' }
  if (trimmed.length > 5000) return { ok: false, error: 'That message is a little long — keep it under 5,000 characters.' }

  try {
    await sendMessageFromPatient(ctx.organizationId, ctx.patientId, trimmed)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
  revalidatePath('/patient/messages')
  return { ok: true }
}
