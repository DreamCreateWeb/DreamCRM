import { db } from '@/lib/db'
import { appointment, patient } from '@/lib/db/schema/clinic'
import { eq, and, gte, lt, desc, sql } from 'drizzle-orm'

export interface AppointmentRow {
  id: string
  title: string
  type: string
  status: string
  startTime: Date
  endTime: Date | null
  notes: string | null
  patientId: string
  patientFirstName: string
  patientLastName: string
  locationId: string | null
}

export async function getAppointments(orgId: string): Promise<AppointmentRow[]> {
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
    .where(eq(appointment.organizationId, orgId))
    .orderBy(desc(appointment.startTime))
}

export async function getTodayAppointments(orgId: string): Promise<AppointmentRow[]> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
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
        gte(appointment.startTime, start),
        lt(appointment.startTime, end),
      ),
    )
    .orderBy(appointment.startTime)
}

export async function getAppointmentStatusCounts(orgId: string): Promise<Record<string, number>> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekEnd = new Date(today)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const [todayCount, weekCount, totalCount] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(appointment)
      .where(and(eq(appointment.organizationId, orgId), gte(appointment.startTime, today), lt(appointment.startTime, new Date(today.getTime() + 86400000)))),
    db.select({ n: sql<number>`count(*)` }).from(appointment)
      .where(and(eq(appointment.organizationId, orgId), gte(appointment.startTime, today), lt(appointment.startTime, weekEnd), sql`${appointment.status} NOT IN ('cancelled','no_show')`)),
    db.select({ n: sql<number>`count(*)` }).from(appointment)
      .where(eq(appointment.organizationId, orgId)),
  ])

  return {
    today: Number(todayCount[0]?.n ?? 0),
    week: Number(weekCount[0]?.n ?? 0),
    total: Number(totalCount[0]?.n ?? 0),
  }
}
