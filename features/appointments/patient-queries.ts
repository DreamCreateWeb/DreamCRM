import { db } from '@/lib/db'
import { appointment } from '@/lib/db/schema/clinic'
import { eq, and, gte, desc } from 'drizzle-orm'
import type { AppointmentRow } from './queries'

export async function getPatientAppointments(orgId: string, patientId: string): Promise<AppointmentRow[]> {
  const { patient } = await import('@/lib/db/schema/clinic')
  return db
    .select({
      id: appointment.id,
      title: appointment.title,
      type: appointment.type,
      status: appointment.status,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      notes: appointment.notes,
      patientId: appointment.patientId,
      patientFirstName: patient.firstName,
      patientLastName: patient.lastName,
      locationId: appointment.locationId,
    })
    .from(appointment)
    .innerJoin(patient, eq(patient.id, appointment.patientId))
    .where(and(eq(appointment.organizationId, orgId), eq(appointment.patientId, patientId)))
    .orderBy(desc(appointment.startTime))
}

export async function getPatientUpcomingAppointments(orgId: string, patientId: string, limit = 5) {
  const { patient } = await import('@/lib/db/schema/clinic')
  const now = new Date()
  return db
    .select({
      id: appointment.id,
      title: appointment.title,
      type: appointment.type,
      status: appointment.status,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      notes: appointment.notes,
      patientId: appointment.patientId,
      patientFirstName: patient.firstName,
      patientLastName: patient.lastName,
      locationId: appointment.locationId,
    })
    .from(appointment)
    .innerJoin(patient, eq(patient.id, appointment.patientId))
    .where(
      and(
        eq(appointment.organizationId, orgId),
        eq(appointment.patientId, patientId),
        gte(appointment.startTime, now),
      ),
    )
    .orderBy(appointment.startTime)
    .limit(limit)
}
