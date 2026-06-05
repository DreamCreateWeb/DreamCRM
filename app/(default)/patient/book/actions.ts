'use server'

import { randomUUID } from 'crypto'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { appointment } from '@/lib/db/schema/clinic'
import { requireTenant } from '@/lib/auth/context'
import { isSlotAvailable, SLOT_MINUTES } from '@/lib/services/booking'
import { queueAppointmentWriteBack } from '@/lib/services/pms'

export async function bookAppointment(formData: FormData) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') throw new Error('Only patients can use the portal booking')
  if (!ctx.patientId) throw new Error('No patient record found for your account')

  const startTimeRaw = formData.get('startTime')?.toString()
  const startTime = startTimeRaw ? new Date(startTimeRaw) : null
  if (!startTime || isNaN(startTime.getTime())) redirect('/patient/book?error=invalid_time')
  if (startTime.getTime() < Date.now()) redirect('/patient/book?error=past')

  // Race-condition + valid-opening guard, identical to the public booking
  // widget: confirm the slot is a real open time during clinic hours that isn't
  // already taken before inserting, so two patients can't grab the same slot
  // and an off-hours pick can't create a phantom row the clinic never sees.
  const free = await isSlotAvailable(ctx.organizationId, startTime)
  if (!free) redirect('/patient/book?error=unavailable')

  const type = formData.get('type')?.toString() || 'checkup'
  const notes = formData.get('notes')?.toString().trim() || null
  // Default 30-min visit so the schedule view + conflict math + PMS write-back
  // all have an end time (the row previously inserted with endTime=null).
  const endTime = new Date(startTime.getTime() + SLOT_MINUTES * 60_000)

  const apptId = randomUUID()
  await db.insert(appointment).values({
    id: apptId,
    organizationId: ctx.organizationId,
    patientId: ctx.patientId,
    title: `${type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')} - ${ctx.userName}`,
    startTime,
    endTime,
    type,
    status: 'scheduled',
    notes,
    source: 'portal',
  })

  // Two-way PMS: queue this portal booking to be written to the clinic's PMS.
  await queueAppointmentWriteBack(ctx.organizationId, apptId)

  revalidatePath('/patient/dashboard')
  revalidatePath('/patient/appointments')
  redirect('/patient/appointments')
}
