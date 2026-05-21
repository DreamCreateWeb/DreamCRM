'use server'

import { randomUUID } from 'crypto'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { appointment } from '@/lib/db/schema/clinic'
import { requireTenant } from '@/lib/auth/context'

export async function bookAppointment(formData: FormData) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') throw new Error('Only patients can use the portal booking')
  if (!ctx.patientId) throw new Error('No patient record found for your account')

  const startTimeRaw = formData.get('startTime')?.toString()
  if (!startTimeRaw) throw new Error('Appointment time is required')
  const startTime = new Date(startTimeRaw)
  if (isNaN(startTime.getTime())) throw new Error('Invalid date/time')
  if (startTime.getTime() < Date.now()) throw new Error('Appointment time must be in the future')

  const type = formData.get('type')?.toString() || 'checkup'
  const notes = formData.get('notes')?.toString().trim() || null

  await db.insert(appointment).values({
    id: randomUUID(),
    organizationId: ctx.organizationId,
    patientId: ctx.patientId,
    title: `${type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')} - ${ctx.userName}`,
    startTime,
    type,
    status: 'scheduled',
    notes,
    source: 'portal',
  })

  revalidatePath('/patient/dashboard')
  revalidatePath('/patient/appointments')
  redirect('/patient/appointments')
}
