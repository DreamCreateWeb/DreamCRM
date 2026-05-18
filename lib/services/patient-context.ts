import 'server-only'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { InboxPatientContext } from '@/lib/types/patient-context'

export type { InboxPatientContext } from '@/lib/types/patient-context'

export async function getInboxPatientContext(
  patientId: string,
  organizationId: string,
): Promise<InboxPatientContext | null> {
  const [p] = await db
    .select()
    .from(schema.patient)
    .where(and(eq(schema.patient.id, patientId), eq(schema.patient.organizationId, organizationId)))
    .limit(1)
  if (!p) return null

  const now = new Date()
  const upcoming = await db
    .select()
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.patientId, patientId),
        eq(schema.appointment.organizationId, organizationId),
        gte(schema.appointment.startTime, now),
      ),
    )
    .orderBy(schema.appointment.startTime)
    .limit(1)

  const recent = await db
    .select()
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.patientId, patientId),
        eq(schema.appointment.organizationId, organizationId),
      ),
    )
    .orderBy(desc(schema.appointment.startTime))
    .limit(1)

  // Total visit count regardless of status — used for the "x visits" badge.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.patientId, patientId),
        eq(schema.appointment.organizationId, organizationId),
      ),
    )

  return {
    patient: p,
    nextAppointment: upcoming[0] ?? null,
    lastAppointment: recent[0] ?? null,
    appointmentCount: count ?? 0,
  }
}

