import 'server-only'
import { and, eq, desc, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { patient, appointment } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'

export async function getMyPatientRecord(patientId: string) {
  const [row] = await db
    .select()
    .from(patient)
    .where(eq(patient.id, patientId))
    .limit(1)
  return row ?? null
}

export async function getMyUpcomingAppointments(patientId: string, organizationId: string) {
  return db
    .select()
    .from(appointment)
    .where(
      and(
        eq(appointment.patientId, patientId),
        eq(appointment.organizationId, organizationId),
        gte(appointment.startTime, new Date()),
      ),
    )
    .orderBy(appointment.startTime)
    .limit(10)
}

export async function getMyPastAppointments(patientId: string, organizationId: string) {
  return db
    .select()
    .from(appointment)
    .where(
      and(
        eq(appointment.patientId, patientId),
        eq(appointment.organizationId, organizationId),
      ),
    )
    .orderBy(desc(appointment.startTime))
    .limit(50)
}

export async function getMyClinicHeader(organizationId: string) {
  const [row] = await db
    .select({
      displayName: clinicProfile.displayName,
      phone: clinicProfile.phone,
      email: clinicProfile.email,
      logoUrl: clinicProfile.logoUrl,
      brandColor: clinicProfile.brandColor,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  return row ?? null
}
