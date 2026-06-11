'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
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
import { getSlotsForDay } from '@/lib/services/booking'
import { sendNotificationEmail } from '@/lib/email'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { queueCommLogWriteBack } from '@/lib/services/pms/sync'
import { sendBookingConfirmation } from '@/lib/services/booking-confirmation'
import { sendReminderEmail } from '@/lib/services/reminder-automation'

async function requireClinicTenant() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Only clinic tenants can manage appointments')
  }
  return ctx
}

export async function confirmAppointmentAction(appointmentId: string): Promise<{ ok: true }> {
  const ctx = await requireClinicTenant()
  await confirmAppointment(ctx.organizationId, appointmentId, 'manual')
  revalidatePath('/appointments')
  revalidatePath('/')
  return { ok: true }
}

export async function cancelAppointmentAction(appointmentId: string): Promise<{ ok: true }> {
  const ctx = await requireClinicTenant()
  await cancelAppointment(ctx.organizationId, appointmentId)
  revalidatePath('/appointments')
  revalidatePath('/')
  return { ok: true }
}

export async function markNoShowAction(appointmentId: string): Promise<{ ok: true }> {
  const ctx = await requireClinicTenant()
  await markNoShow(ctx.organizationId, appointmentId)
  revalidatePath('/appointments')
  return { ok: true }
}

export async function markCompletedAction(appointmentId: string): Promise<{ ok: true }> {
  const ctx = await requireClinicTenant()
  await markCompleted(ctx.organizationId, appointmentId)
  revalidatePath('/appointments')
  return { ok: true }
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
  // Same honest-error treatment as createInternalAppointmentAction;
  // exclude the appointment-being-rescheduled so its old slot doesn't
  // count as "taken" against itself.
  const { slots: rSlots, closedReason: rClosedReason } = await getSlotsForDay(
    ctx.organizationId, start, input.appointmentId,
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
  const end = input.newEndTime ? new Date(input.newEndTime) : null
  const newId = await rescheduleAppointment({
    organizationId: ctx.organizationId,
    appointmentId: input.appointmentId,
    newStartTime: start,
    newEndTime: end,
  })

  // Best-effort patient notification — we don't fail the reschedule if email
  // delivery fails. The reschedule is the source of truth; comms is async.
  if (input.notifyPatient) {
    try {
      const detail = await getAppointmentDetail(ctx.organizationId, newId)
      if (detail?.patient.email) {
        const sender = await getClinicSenderIdentity(ctx.organizationId)
        await sendNotificationEmail({
          to: detail.patient.email,
          name: detail.patient.fullName,
          title: 'Your appointment was rescheduled',
          body: `Hi ${detail.patient.fullName.split(' ')[0]} — your ${detail.type.replace(/_/g, ' ')} at ${sender.name} has been moved to ${start.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: sender.timeZone })}. Reply or call if this doesn't work.`,
        }, sender)
        await queueCommLogWriteBack(ctx.organizationId, detail.patient.id, {
          note: `Appointment rescheduled to ${start.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} — patient notified by email.`,
          mode: 'Email',
        })
      }
    } catch (err) {
      console.warn('[reschedule] notify failed', err)
    }
  }

  revalidatePath('/appointments')
  revalidatePath('/')
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
): Promise<ReminderResult> {
  if (channel === 'sms') {
    // Twilio isn't live yet — log the intent so the audit trail is complete,
    // and let the UI surface the "not yet" message.
    return { ok: false, error: 'SMS reminders ship with the Twilio integration in the SMS-replies module' }
  }
  const detail = await getAppointmentDetail(ctx.organizationId, appointmentId)
  if (!detail) return { ok: false, error: 'Appointment not found' }
  if (detail.status === 'cancelled' || detail.status === 'no_show') {
    return { ok: false, error: `Cannot send a reminder for a ${detail.status === 'no_show' ? 'no-show' : 'cancelled'} appointment` }
  }
  // The reminder template asks the patient to confirm ("Reply CONFIRM…"), so
  // sending it to an already-confirmed (or completed) visit is contradictory.
  // "Cannot send" is matched by the bulk handler → counted as skipped, not an
  // error, so a "select all → Send reminder" quietly skips confirmed rows.
  if (detail.status === 'confirmed' || detail.status === 'completed') {
    return { ok: false, error: `Cannot send a reminder — this appointment is already ${detail.status}` }
  }
  if (!detail.patient.email) return { ok: false, error: 'Patient has no email on file' }

  // Shared compose + send + commlog + audit-log path, reused by the automated
  // reminder engine (lib/services/reminder-automation.ts) so the two can't drift.
  const sender = await getClinicSenderIdentity(ctx.organizationId)
  return sendReminderEmail(ctx.organizationId, detail, sender, ctx.userId)
}

export async function sendReminderAction(
  appointmentId: string,
  channel: 'sms' | 'email' = 'email',
): Promise<ReminderResult> {
  const ctx = await requireClinicTenant()
  const r = await sendReminderForOrg(ctx, appointmentId, channel)
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
  notes?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await requireClinicTenant()
  const start = new Date(input.startTime)
  if (Number.isNaN(start.getTime()) || start < new Date()) {
    return { ok: false, error: 'Appointment time must be in the future' }
  }
  // Honest error per closedReason — "conflicts with existing" is wrong
  // when the actual cause is a closed day or past closing.
  const { slots, closedReason } = await getSlotsForDay(ctx.organizationId, start)
  const targetIso = start.toISOString()
  const slot = slots.find((s) => s.startIso === targetIso)
  if (!slot || !slot.available) {
    const error =
      closedReason === 'day_closed' ? "We're closed that day. Pick another date." :
      closedReason === 'past_closing' ? "That time is past closing. Try a different time or day." :
      closedReason === 'invalid_hours' ? "Online booking isn't set up for this day — give us a call." :
      slot && !slot.available ? 'That slot conflicts with an existing appointment.' :
      "That time isn't an available slot. Pick another."
    return { ok: false, error }
  }
  const create: CreateInternalAppointmentInput = {
    organizationId: ctx.organizationId,
    patientId: input.patientId,
    startTime: start,
    type: input.type,
    providerId: input.providerId ?? null,
    notes: input.notes ?? null,
    source: 'manual',
  }
  try {
    const id = await createInternalAppointment(create)
    // Confirm the patient the same way the public widget does — they were
    // just booked without self-initiating, so they should hear about it.
    await sendBookingConfirmation({
      organizationId: ctx.organizationId,
      patientId: input.patientId,
      appointmentType: input.type ?? 'cleaning',
      startTime: start,
    })
    revalidatePath('/appointments')
    revalidatePath(`/patients/${input.patientId}`)
    revalidatePath('/')
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
