'use server'

import { db } from '@/lib/db'
import { appointment } from '@/lib/db/schema/clinic'
import { getTenantContext } from '@/lib/auth/context'
import { randomUUID } from 'crypto'

export async function submitPatientBookingRequest(formData: FormData) {
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'patient') throw new Error('Not authorized')
  if (!ctx.patientId) throw new Error('No patient record linked to your account. Please contact the clinic.')

  const startTimeStr = formData.get('startTime') as string
  if (!startTimeStr) throw new Error('Please select a date and time.')

  const startTime = new Date(startTimeStr)
  if (isNaN(startTime.getTime())) throw new Error('Invalid date/time.')

  const type = (formData.get('type') as string) || 'checkup'
  const notes = (formData.get('notes') as string) || null

  const typeLabel: Record<string, string> = {
    checkup: 'Checkup / Exam',
    cleaning: 'Cleaning',
    filling: 'Filling',
    extraction: 'Extraction',
    root_canal: 'Root Canal',
    consultation: 'Consultation',
    other: 'Appointment',
  }

  await db.insert(appointment).values({
    id: randomUUID(),
    organizationId: ctx.organizationId,
    patientId: ctx.patientId,
    title: typeLabel[type] ?? 'Appointment',
    startTime,
    type,
    status: 'scheduled',
    notes,
  })
}
