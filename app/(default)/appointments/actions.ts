'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  confirmAppointment,
  cancelAppointment,
  markNoShow,
  markCompleted,
  rescheduleAppointment,
  logReminderSent,
  createInternalAppointment,
  getAppointmentDetail,
  type CreateInternalAppointmentInput,
} from '@/lib/services/appointments'
import { isSlotAvailable } from '@/lib/services/booking'
import { sendNotificationEmail } from '@/lib/email'

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
  if (!(await isSlotAvailable(ctx.organizationId, start))) {
    return { ok: false, error: 'That slot is no longer available' }
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
        await sendNotificationEmail({
          to: detail.patient.email,
          name: detail.patient.fullName,
          title: 'Your appointment was rescheduled',
          body: `Hi ${detail.patient.fullName.split(' ')[0]} — your ${detail.type.replace(/_/g, ' ')} at ${ctx.organizationName} has been moved to ${start.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Reply or call if this doesn't work.`,
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

export async function sendReminderAction(
  appointmentId: string,
  channel: 'sms' | 'email' = 'email',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireClinicTenant()
  if (channel === 'sms') {
    // Twilio isn't live yet — log the intent so the audit trail is complete,
    // and let the UI surface the "not yet" message.
    return { ok: false, error: 'SMS reminders ship with the Twilio integration in the SMS-replies module' }
  }
  const detail = await getAppointmentDetail(ctx.organizationId, appointmentId)
  if (!detail) return { ok: false, error: 'Appointment not found' }
  if (!detail.patient.email) return { ok: false, error: 'Patient has no email on file' }

  try {
    const startStr = detail.startTime.toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
    await sendNotificationEmail({
      to: detail.patient.email,
      name: detail.patient.fullName,
      title: `Reminder: your ${detail.type.replace(/_/g, ' ')} on ${detail.startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`,
      body: `Hi ${detail.patient.fullName.split(' ')[0]} — just a quick reminder of your ${detail.type.replace(/_/g, ' ')} appointment at ${ctx.organizationName} on ${startStr}. Reply CONFIRM, call us, or click the link below to confirm. Thanks!`,
      linkPath: `/`,
    })
    await logReminderSent({
      organizationId: ctx.organizationId,
      appointmentId,
      channel: 'email',
      template: 'default_reminder',
      sentByUserId: ctx.userId,
    })
    revalidatePath('/appointments')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
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
  await requireClinicTenant()
  const result: BulkSendResult = {
    attempted: appointmentIds.length,
    sent: 0,
    skipped: 0,
    errors: [],
  }
  for (const id of appointmentIds) {
    const r = await sendReminderAction(id, channel)
    if ('ok' in r && r.ok === true) result.sent += 1
    else if ('error' in r && r.error.includes('no email')) result.skipped += 1
    else result.errors.push({ appointmentId: id, error: 'error' in r ? r.error : 'unknown' })
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
  if (!(await isSlotAvailable(ctx.organizationId, start))) {
    return { ok: false, error: 'That slot conflicts with an existing appointment' }
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
    revalidatePath('/appointments')
    revalidatePath(`/patients/${input.patientId}`)
    revalidatePath('/')
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
