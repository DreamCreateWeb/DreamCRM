import 'server-only'
import { loadIntakeOnFile } from '@/lib/services/intake-on-file-read'
import { getFeatureSwitchState } from '@/lib/services/feature-switches'
import { and, asc, eq, gte, inArray, lt, max, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { getClinicCadence } from '@/lib/services/clinic-cadence'
import { clinicDayStart } from '@/lib/clinic-timezone'
import { clinicDayKey } from '@/lib/format-datetime'
import { getLatestInsuranceChecksForPatients } from '@/lib/services/insurance-eligibility'
import { primaryCardsByPatient } from '@/lib/services/insurance-eligibility/plans'
import { getIntakeAlertsForAppointments, type IntakeAlertView } from '@/lib/services/intake-summary'
import { isStaleCheck } from '@/lib/insurance-eligibility'
import { isBirthdayThisWeek, lapsedCutoff } from '@/lib/dates'
import { notCsvImportVisit } from '@/lib/services/visit-sources'

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
    | 'insurance_stale'
    /** The intake form reported an allergy / medication / condition (ML-27).
     *  Carries the alert text; its href is the submission. Never emailed. */
    | 'medical_alert'
  label: string
  /** Optional door for the flag (site-relative). */
  href?: string
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

/** One visit on an audited day — an audit item plus where the visit stands. */
export interface DayVisit extends AuditItem {
  status: string
  endTime: Date | null
}

export interface DayVisits {
  /** Clinic-local 'YYYY-MM-DD' of the audited day. */
  dayKey: string
  /** Every visit the scope covers, soonest first — `flags` may be empty. */
  visits: DayVisit[]
}

/**
 * Which visits a day's read covers. `live` = still on the books (scheduled or
 * confirmed) — the right read for a day AHEAD. `held` = everything that was
 * not cancelled — the right read for TODAY, where a visit already marked done
 * or a no-show is still part of the day the team is looking at.
 */
export type DayScope = 'live' | 'held'

const LIVE_STATUSES = ['scheduled', 'confirmed']

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
}

/** Audit tomorrow's schedule (clinic-local "tomorrow" — the server runs UTC). */
export async function auditUpcomingDay(
  organizationId: string,
  opts?: { now?: Date },
): Promise<DayAudit> {
  const day = await auditClinicDay(organizationId, { now: opts?.now, dayOffset: 1, scope: 'live' })
  return {
    dayKey: day.dayKey,
    visitCount: day.visits.length,
    // The shape My Day and the digest have always read: only the visits
    // needing prep, without the day-read's extra columns.
    items: day.visits
      .filter((v) => v.flags.length > 0)
      .map((v) => ({
        appointmentId: v.appointmentId,
        patientId: v.patientId,
        patientName: v.patientName,
        startTime: v.startTime,
        type: v.type,
        providerName: v.providerName,
        flags: v.flags,
      })),
  }
}

/**
 * THE ONE AUDIT of a clinic-local day (`dayOffset` from the clinic's today:
 * 0 = today, 1 = tomorrow). My Day and the digest read tomorrow through
 * `auditUpcomingDay`; the Huddle (docs/daily-tools.md) reads today and the
 * next day on the books through this — one set of rules, so a patient can
 * never be "forms missing" on one page and clean on another.
 *
 * Flags are PREP: they are computed only for visits still ahead of the
 * practice (scheduled / confirmed). A visit already marked done, or a
 * no-show, carries none.
 */
export async function auditClinicDay(
  organizationId: string,
  opts: { now?: Date; dayOffset: number; scope?: DayScope },
): Promise<DayVisits> {
  const now = opts.now ?? new Date()
  const scope = opts.scope ?? 'live'
  const tz = await getClinicTimeZone(organizationId)
  const dayStart = clinicDayStart(now, tz, opts.dayOffset)
  const dayEnd = clinicDayStart(now, tz, opts.dayOffset + 1)
  const dayKey = clinicDayKey(dayStart, tz)
  // "Birthday this week" is relative to the clinic's TODAY (timezone rule 2).
  const todayKey = clinicDayKey(now, tz)

  const rows = await db
    .select({
      appointmentId: schema.appointment.id,
      patientId: schema.appointment.patientId,
      startTime: schema.appointment.startTime,
      endTime: schema.appointment.endTime,
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
        ...(scope === 'live'
          ? [inArray(schema.appointment.status, LIVE_STATUSES)]
          : // A CSV roster's placeholder visit is never a chair (visit-sources.ts).
            [ne(schema.appointment.status, 'cancelled'), notCsvImportVisit()]),
        gte(schema.appointment.startTime, dayStart),
        lt(schema.appointment.startTime, dayEnd),
      ),
    )
    .orderBy(asc(schema.appointment.startTime))
    .limit(100)

  if (rows.length === 0) return { dayKey, visits: [] }

  const patientIds = Array.from(new Set(rows.map((r) => r.patientId)))
  // ML-50b: the card on file is the primary slot in patient_insurance.
  const primaryCards = await primaryCardsByPatient(organizationId, patientIds)
  const policyOf = (patientId: string) => primaryCards.get(patientId)?.policyNumber ?? null
  const appointmentIds = rows.map((r) => r.appointmentId)

  // Three batched set queries — never per-patient N+1.
  const [intakeOnFile, lastVisitRows, pendingDepositRows, cadence] = await Promise.all([
    // Intake on file — the ONE rule (ML-27/30), not "any submission ever".
    loadIntakeOnFile(organizationId, patientIds, now, tz),
    db
      .select({
        patientId: schema.appointment.patientId,
        // max() over the column, not a bare `sql` expression: the bare form loses
        // `start_time`'s driver mapper, and the raw timestamp text then parses in
        // the host's zone instead of UTC.
        last: max(schema.appointment.startTime),
      })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.organizationId, organizationId),
          inArray(schema.appointment.patientId, patientIds),
          eq(schema.appointment.status, 'completed'),
          // A visit marked done EARLIER TODAY is not a "last visit" for the
          // day being audited — without the bound, today's own completed
          // visit made every one of today's first-timers read as returning.
          lt(schema.appointment.startTime, dayStart),
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
  const switches = await getFeatureSwitchState(organizationId)
  const intakeOpen = switches.intake_forms
  // The chair read (ML-27): cached intake alerts, one batched query. A failed
  // read is an audit without the heads-up, never a dead My Day.
  const alertsByAppt = intakeOpen
    ? await getIntakeAlertsForAppointments(organizationId, appointmentIds).catch(() => new Map<string, IntakeAlertView>())
    : new Map<string, IntakeAlertView>()
  // Insurance on file, never (or not lately) checked — only while the switch
  // is on, and the audit only READS: it never runs a check.
  const insuranceOpen = switches.insurance === true
  const withCard = insuranceOpen
    ? Array.from(new Set(rows.filter((r) => (policyOf(r.patientId) ?? '').trim() !== '').map((r) => r.patientId)))
    : []
  const latestChecks = withCard.length
    ? await getLatestInsuranceChecksForPatients(organizationId, withCard).catch(() => null)
    : null
  const lastVisitByPatient = new Map(
    lastVisitRows.map((r) => [r.patientId, r.last ?? null]),
  )
  const pendingDepositByAppt = new Map(pendingDepositRows.map((r) => [r.appointmentId, r.amountCents]))
  const lapsedBefore = lapsedCutoff(now, cadence.lapsedMonths)

  const visits: DayVisit[] = []
  for (const r of rows) {
    const flags: AuditFlag[] = []
    const base = {
      appointmentId: r.appointmentId,
      patientId: r.patientId,
      patientName: `${r.firstName} ${r.lastName}`.trim(),
      startTime: r.startTime as Date,
      endTime: (r.endTime as Date | null | undefined) ?? null,
      type: r.type,
      status: r.status,
      providerName: r.providerName ?? null,
    }
    // Prep is for a visit still ahead of the practice.
    if (!LIVE_STATUSES.includes(r.status)) {
      visits.push({ ...base, flags })
      continue
    }
    // First, always: what the provider must know before they sit down.
    const alert = alertsByAppt.get(r.appointmentId)
    if (alert) {
      flags.push({
        key: 'medical_alert',
        label: `Heads-up from their intake: ${alert.alerts.join(' · ')}`,
        href: `/intake-forms/submissions/${alert.submissionId}`,
      })
    }
    // A scheduled slot that already PASSED no longer needs a confirmation
    // (the same line My Day draws for today's visits). A day ahead is never
    // past, so tomorrow's audit is unchanged.
    if (r.status === 'scheduled' && (opts.dayOffset !== 0 || (r.startTime as Date) > now)) {
      flags.push({ key: 'unconfirmed', label: 'Not confirmed yet' })
    }
    const depositCents = pendingDepositByAppt.get(r.appointmentId)
    if (depositCents) {
      flags.push({ key: 'deposit_pending', label: `${dollars(depositCents)} booking deposit not completed` })
    }
    // No nag about a module the practice never opened (law 1, verification round).
    if (intakeOpen && !intakeOnFile.has(r.patientId, r.type)) flags.push({ key: 'no_intake', label: 'No intake form on file' })
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
    if (insuranceOpen && latestChecks && (policyOf(r.patientId) ?? '').trim() !== '') {
      const latest = latestChecks.get(r.patientId)
      const href = `/insurance?patient=${r.patientId}`
      if (!latest) {
        flags.push({ key: 'insurance_stale', label: 'Insurance on file, never checked — run it before they arrive', href })
      } else if (isStaleCheck(latest.checkedAt.toISOString(), now)) {
        flags.push({ key: 'insurance_stale', label: 'Insurance on file, not checked in 30+ days — run it before they arrive', href })
      }
    }
    if (isBirthdayThisWeek(r.dateOfBirth, todayKey)) flags.push({ key: 'birthday', label: 'Birthday this week 🎂' })

    visits.push({ ...base, flags })
  }

  return { dayKey, visits }
}
