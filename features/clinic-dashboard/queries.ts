import { db } from '@/lib/db'
import { patient, appointment } from '@/lib/db/schema/clinic'
import { eq, count, gte, and, lt, sql, desc } from 'drizzle-orm'

export interface MonthPoint { month: string; value: number }

function lastNMonths(n: number): string[] {
  const months: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export async function getPatientCount(orgId: string): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(patient)
    .where(and(eq(patient.organizationId, orgId), eq(patient.isActive, 1)))
  return Number(value)
}

export async function getNewPatientCount(orgId: string, days: number): Promise<number> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const [{ value }] = await db
    .select({ value: count() })
    .from(patient)
    .where(and(eq(patient.organizationId, orgId), gte(patient.createdAt, since)))
  return Number(value)
}

export async function getTodayAppointmentCount(orgId: string): Promise<number> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const [{ value }] = await db
    .select({ value: count() })
    .from(appointment)
    .where(
      and(
        eq(appointment.organizationId, orgId),
        gte(appointment.startTime, start),
        lt(appointment.startTime, end),
      ),
    )
  return Number(value)
}

export async function getUpcomingAppointmentCount(orgId: string, days = 7): Promise<number> {
  const now = new Date()
  const end = new Date()
  end.setDate(end.getDate() + days)
  const [{ value }] = await db
    .select({ value: count() })
    .from(appointment)
    .where(
      and(
        eq(appointment.organizationId, orgId),
        gte(appointment.startTime, now),
        lt(appointment.startTime, end),
        sql`${appointment.status} NOT IN ('cancelled', 'no_show')`,
      ),
    )
  return Number(value)
}

export async function getMonthlyNewPatients(orgId: string, numMonths = 8): Promise<MonthPoint[]> {
  const since = new Date()
  since.setMonth(since.getMonth() - numMonths)
  since.setDate(1)

  const rows = await db
    .select({
      month: sql<string>`TO_CHAR(${patient.createdAt}, 'YYYY-MM')`,
      n: count(),
    })
    .from(patient)
    .where(and(eq(patient.organizationId, orgId), gte(patient.createdAt, since)))
    .groupBy(sql`TO_CHAR(${patient.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${patient.createdAt}, 'YYYY-MM')`)

  const map = Object.fromEntries(rows.map(r => [r.month, Number(r.n)]))
  return lastNMonths(numMonths).map(m => ({ month: m, value: map[m] ?? 0 }))
}

export interface UpcomingAppointment {
  id: string
  title: string
  type: string
  status: string
  startTime: Date
  endTime: Date | null
  patientFirstName: string
  patientLastName: string
}

export async function getUpcomingAppointments(orgId: string, limit = 8): Promise<UpcomingAppointment[]> {
  const now = new Date()
  const rows = await db
    .select({
      id: appointment.id,
      title: appointment.title,
      type: appointment.type,
      status: appointment.status,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      patientFirstName: patient.firstName,
      patientLastName: patient.lastName,
    })
    .from(appointment)
    .innerJoin(patient, eq(patient.id, appointment.patientId))
    .where(
      and(
        eq(appointment.organizationId, orgId),
        gte(appointment.startTime, now),
        sql`${appointment.status} NOT IN ('cancelled', 'no_show')`,
      ),
    )
    .orderBy(appointment.startTime)
    .limit(limit)
  return rows
}

export async function getRecentPatients(orgId: string, limit = 5) {
  return db
    .select()
    .from(patient)
    .where(eq(patient.organizationId, orgId))
    .orderBy(desc(patient.createdAt))
    .limit(limit)
}
