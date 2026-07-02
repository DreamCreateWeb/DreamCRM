import 'server-only'
import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { getClinicCadence } from '@/lib/services/clinic-cadence'
import { clinicDayStart } from '@/lib/clinic-timezone'
import { clinicDayKey } from '@/lib/format-datetime'
import { isBirthdayThisWeek, lapsedCutoff } from '@/lib/dates'

/**
 * The per-patient audit of tomorrow's schedule — Lighthouse's signature
 * "nightly audit" done one better: computed LIVE (My Day + the morning
 * digest call it on render/send), so it never shows yesterday's truth.
 * Every one of tomorrow's patients is checked against the front-desk
 * checklist and only the ones needing prep surface, each with plain-language
 * reasons ("Owes $350 — collect at the visit", never "AR flag").
 */

export interface AuditFlag {
  key:
    | 'unconfirmed'
    | 'no_intake'
    | 'balance'
    | 'unreachable'
    | 'new_patient'
    | 'lapsed_returning'
    | 'deposit_pending'
    | 'birthday'
  label: string
}

export interface AuditItem {
  appointmentId: string
  patientId: string
  patientName: string
  startTime: Date
  /** Visit-type id (render with your usual label mapping). */
  type: string
  providerName: string | null
  flags: AuditFlag[]
}

export interface DayAudit {
  /** Clinic-local 'YYYY-MM-DD' of the audited day (tomorrow). */
  dayKey: string
  /** Total live visits on the day (audited + clean). */
  visitCount: number
  /** Only the visits needing prep, soonest first. */
  items: AuditItem[]
}

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
}

/** Audit tomorrow's schedule (clinic-local "tomorrow" — the server runs UTC). */
export async function auditUpcomingDay(
  organizationId: string,
  opts?: { now?: Date },
): Promise<DayAudit> {
  const now = opts?.now ?? new Date()
  const tz = await getClinicTimeZone(organizationId)
  const dayStart = clinicDayStart(now, tz, 1)
  const dayEnd = clinicDayStart(now, tz, 2)
  const dayKey = clinicDayKey(dayStart, tz)

  const rows = await db
    .select({
      appointmentId: schema.appointment.id,
      patientId: schema.appointment.patientId,
      startTime: schema.appointment.startTime,
      type: schema.appointment.type,
      status: schema.appointment.status,
      providerName: schema.clinicProvider.displayName,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      email: schema.patient.email,
      phone: schema.patient.phone,
      dateOfBirth: schema.patient.dateOfBirth,
      balance: schema.patient.pmsBalanceCents,
    })
    .from(schema.appointment)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.appointment.patientId))
    .leftJoin(schema.clinicProvider, eq(schema.clinicProvider.id, schema.appointment.providerId))
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        inArray(schema.appointment.status, ['scheduled', 'confirmed']),
        gte(schema.appointment.startTime, dayStart),
        lt(schema.appointment.startTime, dayEnd),
      ),
    )
    .orderBy(asc(schema.appointment.startTime))
    .limit(100)

  if (rows.length === 0) return { dayKey, visitCount: 0, items: [] }

  const patientIds = Array.from(new Set(rows.map((r) => r.patientId)))
  const appointmentIds = rows.map((r) => r.appointmentId)

  // Three batched set queries — never per-patient N+1.
  const [submittedRows, lastVisitRows, pendingDepositRows, cadence] = await Promise.all([
    db
      .selectDistinct({ patientId: schema.formSubmission.patientId })
      .from(schema.formSubmission)
      .where(
        and(
          eq(schema.formSubmission.organizationId, organizationId),
          inArray(schema.formSubmission.patientId, patientIds),
        ),
      ),
    db
      .select({
        patientId: schema.appointment.patientId,
        last: sql<Date>`max(${schema.appointment.startTime})`,
      })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.organizationId, organizationId),
          inArray(schema.appointment.patientId, patientIds),
          eq(schema.appointment.status, 'completed'),
        ),
      )
      .groupBy(schema.appointment.patientId),
    db
      .select({ appointmentId: schema.bookingDeposit.appointmentId, amountCents: schema.bookingDeposit.amountCents })
      .from(schema.bookingDeposit)
      .where(
        and(
          eq(schema.bookingDeposit.organizationId, organizationId),
          inArray(schema.bookingDeposit.appointmentId, appointmentIds),
          eq(schema.bookingDeposit.status, 'pending'),
        ),
      ),
    getClinicCadence(organizationId),
  ])
  const submittedSet = new Set(submittedRows.map((r) => r.patientId).filter(Boolean))
  const lastVisitByPatient = new Map(
    lastVisitRows.map((r) => [r.patientId, r.last ? new Date(r.last as unknown as string) : null]),
  )
  const pendingDepositByAppt = new Map(pendingDepositRows.map((r) => [r.appointmentId, r.amountCents]))
  const lapsedBefore = lapsedCutoff(now, cadence.lapsedMonths)

  const items: AuditItem[] = []
  for (const r of rows) {
    const flags: AuditFlag[] = []
    if (r.status === 'scheduled') flags.push({ key: 'unconfirmed', label: 'Not confirmed yet' })
    const depositCents = pendingDepositByAppt.get(r.appointmentId)
    if (depositCents) {
      flags.push({ key: 'deposit_pending', label: `${dollars(depositCents)} booking deposit not completed` })
    }
    if (!submittedSet.has(r.patientId)) flags.push({ key: 'no_intake', label: 'No intake form on file' })
    if ((r.balance ?? 0) > 0) {
      flags.push({ key: 'balance', label: `Owes ${dollars(r.balance!)} — worth settling at the visit` })
    }
    if (!r.email && !r.phone) {
      flags.push({ key: 'unreachable', label: 'No email or phone on file — can’t remind them' })
    }
    const lastVisit = lastVisitByPatient.get(r.patientId) ?? null
    if (!lastVisit) flags.push({ key: 'new_patient', label: 'First visit — roll out the welcome' })
    else if (lastVisit < lapsedBefore) {
      flags.push({ key: 'lapsed_returning', label: 'First visit back in a long while — make it count' })
    }
    if (isBirthdayThisWeek(r.dateOfBirth, now)) flags.push({ key: 'birthday', label: 'Birthday this week 🎂' })

    if (flags.length > 0) {
      items.push({
        appointmentId: r.appointmentId,
        patientId: r.patientId,
        patientName: `${r.firstName} ${r.lastName}`.trim(),
        startTime: r.startTime as Date,
        type: r.type,
        providerName: r.providerName ?? null,
        flags,
      })
    }
  }

  return { dayKey, visitCount: rows.length, items }
}
