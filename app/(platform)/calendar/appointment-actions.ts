'use server'

import { randomUUID } from 'crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { appointment } from '@/lib/db/schema/clinic'

async function requireOrgId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('Not authenticated')
  const orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
  if (!orgId) throw new Error('No active organization')
  return orgId
}

export async function addAppointment(formData: FormData) {
  const orgId = await requireOrgId()

  const patientId = formData.get('patientId')?.toString().trim()
  const title = formData.get('title')?.toString().trim()
  const startTimeRaw = formData.get('startTime')?.toString().trim()

  if (!patientId) throw new Error('Patient is required')
  if (!title) throw new Error('Title is required')
  if (!startTimeRaw) throw new Error('Start time is required')

  const startTime = new Date(startTimeRaw)
  if (isNaN(startTime.getTime())) throw new Error('Invalid start time')

  const endTimeRaw = formData.get('endTime')?.toString().trim()
  const endTime = endTimeRaw ? new Date(endTimeRaw) : null
  if (endTime && isNaN(endTime.getTime())) throw new Error('Invalid end time')

  await db.insert(appointment).values({
    id: randomUUID(),
    organizationId: orgId,
    patientId,
    title,
    startTime,
    endTime,
    type: formData.get('type')?.toString() || 'checkup',
    status: 'scheduled',
    notes: formData.get('notes')?.toString().trim() || null,
    locationId: formData.get('locationId')?.toString() || null,
  })

  revalidatePath('/calendar')
}

export async function updateAppointmentStatus(appointmentId: string, status: string) {
  const orgId = await requireOrgId()
  await db
    .update(appointment)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(appointment.id, appointmentId), eq(appointment.organizationId, orgId)))
  revalidatePath('/calendar')
}

export async function deleteAppointment(appointmentId: string) {
  const orgId = await requireOrgId()
  await db
    .delete(appointment)
    .where(and(eq(appointment.id, appointmentId), eq(appointment.organizationId, orgId)))
  revalidatePath('/calendar')
}
