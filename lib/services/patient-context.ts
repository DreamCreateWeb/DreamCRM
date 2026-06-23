import 'server-only'
import { and, asc, desc, eq, gte, lte, ne, sql } from 'drizzle-orm'
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
  // The three appointment reads are independent — one parallel batch, not three
  // serial round-trips. Next/last use the SAME semantics as getPatientHeader so
  // the Inbox context strip agrees with the Patients/Messages strips: the "last
  // visit" is the most recent ATTENDED visit (past, not cancelled/no-show), not
  // whatever row happens to sort last (which could be a future or cancelled one).
  const [upcoming, recent, countRows] = await Promise.all([
    db
      .select()
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.patientId, patientId),
          eq(schema.appointment.organizationId, organizationId),
          gte(schema.appointment.startTime, now),
          ne(schema.appointment.status, 'cancelled'),
          ne(schema.appointment.status, 'no_show'),
        ),
      )
      .orderBy(asc(schema.appointment.startTime))
      .limit(1),
    db
      .select()
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.patientId, patientId),
          eq(schema.appointment.organizationId, organizationId),
          lte(schema.appointment.startTime, now),
          ne(schema.appointment.status, 'cancelled'),
          ne(schema.appointment.status, 'no_show'),
        ),
      )
      .orderBy(desc(schema.appointment.startTime))
      .limit(1),
    // Total visit count regardless of status — the "x visits" badge.
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.patientId, patientId),
          eq(schema.appointment.organizationId, organizationId),
        ),
      ),
  ])

  return {
    patient: p,
    nextAppointment: upcoming[0] ?? null,
    lastAppointment: recent[0] ?? null,
    appointmentCount: countRows[0]?.count ?? 0,
  }
}

