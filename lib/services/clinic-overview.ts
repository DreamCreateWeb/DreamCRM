import 'server-only'
import { and, asc, between, count, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/**
 * Clinic-side daily dashboard service. Returns everything the Overview
 * page renders in a single call so the page can show a coherent "as of
 * one second ago" snapshot.
 *
 * Per the research: dental clinics live in the morning huddle. Every
 * number on this dashboard must answer "what action does this need" and
 * drill to a list. Vanity metrics (6-month charts, etc.) are kept off.
 *
 * What we own (and surface):
 * - bookings (the appointment table)
 * - intake submissions (form_submission)
 * - outstanding shop balances (invoices)
 * - patient roster (patient)
 *
 * What we DON'T own (and don't pretend to):
 * - production $ (per-appointment $ amounts; needs PMS sync)
 * - clinical AR (claims, EOBs)
 * - case acceptance %, hygiene reappt %
 * - SMS replies, reviews — separate modules later
 */

export interface ClinicOverviewData {
  date: Date
  todaysAppointments: TodayAppointmentRow[]
  unconfirmed: {
    count: number
    preview: AppointmentPreviewRow[]
  }
  intakeSubmissions: {
    count: number
    preview: IntakeSubmissionPreviewRow[]
  }
  outstandingBalances: {
    count: number
    totalCents: number
  }
  trends: {
    bookingsToday: number
    newPatientsMTD: number
    newPatientsLastMTD: number
    upcomingNext7d: number
    activeIntakeForms: number
  }
  recentActivity: ActivityRow[]
}

export interface TodayAppointmentRow {
  id: string
  patientId: string
  patientName: string
  startTime: Date
  endTime: Date | null
  type: string
  status: string
  flags: {
    newPatient: boolean
    birthdayThisWeek: boolean
    hasOutstandingBalance: boolean
    hasIntakeOnFile: boolean
  }
}

export interface AppointmentPreviewRow {
  id: string
  patientName: string
  startTime: Date
}

export interface IntakeSubmissionPreviewRow {
  id: string
  formTitle: string
  submitterName: string | null
  submittedAt: Date
}

export type ActivityKind =
  | 'appointment_booked'
  | 'intake_submitted'
  | 'invoice_paid'
  | 'patient_added'

export interface ActivityRow {
  id: string
  kind: ActivityKind
  occurredAt: Date
  title: string
  subtitle: string | null
  href: string | null
}

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}
function endOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}
function startOfMonth(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), 1)
  r.setHours(0, 0, 0, 0)
  return r
}

function isBirthdayThisWeek(dob: string | null): boolean {
  if (!dob) return false
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  if (!parsed) return false
  const month = parseInt(parsed[2], 10) - 1
  const day = parseInt(parsed[3], 10)
  const today = new Date()
  // Build this year's birthday + check if within today..today+6
  const candidate = new Date(today.getFullYear(), month, day)
  if (candidate < startOfDay(today)) {
    // Already passed this year — check next year's date too (Dec→Jan rollover)
    candidate.setFullYear(today.getFullYear() + 1)
  }
  const sixDaysOut = new Date(today)
  sixDaysOut.setDate(sixDaysOut.getDate() + 6)
  return candidate >= startOfDay(today) && candidate <= endOfDay(sixDaysOut)
}

export async function getClinicOverview(organizationId: string): Promise<ClinicOverviewData> {
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthStart = startOfMonth(now)
  const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  const lastMonthEnd = startOfMonth(now) // exclusive upper bound

  // ── Today's appointments ────────────────────────────────────────────
  const todaysAppts = await db
    .select({
      id: schema.appointment.id,
      patientId: schema.appointment.patientId,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      dateOfBirth: schema.patient.dateOfBirth,
      startTime: schema.appointment.startTime,
      endTime: schema.appointment.endTime,
      type: schema.appointment.type,
      status: schema.appointment.status,
    })
    .from(schema.appointment)
    .innerJoin(schema.patient, eq(schema.appointment.patientId, schema.patient.id))
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        between(schema.appointment.startTime, todayStart, todayEnd),
      ),
    )
    .orderBy(asc(schema.appointment.startTime))

  // For glyph flags we need to know, for each patient on today's chair:
  //   - is this their first appointment ever (new patient)
  //   - do they have unpaid invoices on file
  //   - do they have an intake submission on file
  const patientIdsToday = Array.from(new Set(todaysAppts.map((a) => a.patientId)))

  const newPatientSet = new Set<string>()
  const balanceSet = new Set<string>()
  const intakeSet = new Set<string>()

  if (patientIdsToday.length > 0) {
    // Patients whose ONLY appointments are today's (count of past appts = 0).
    // Cheap-ish way: pull all appointments for those patients with startTime
    // < today, build the set of "has prior" patients, then invert.
    const priors = await db
      .select({ patientId: schema.appointment.patientId })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.organizationId, organizationId),
          inArray(schema.appointment.patientId, patientIdsToday),
          lte(schema.appointment.startTime, todayStart),
        ),
      )
    const hasPrior = new Set(priors.map((p) => p.patientId))
    for (const id of patientIdsToday) {
      if (!hasPrior.has(id)) newPatientSet.add(id)
    }

    // Outstanding balances — look up customers row by email match to patient.
    // We don't have a direct patient→invoice link yet (invoices link to
    // customers, not patient). For v1 we approximate by checking if any
    // unpaid invoices exist for a customer whose email matches a patient.
    // TODO: when we unify patient + customer this becomes a single query.
    const patientEmails = await db
      .select({ id: schema.patient.id, email: schema.patient.email })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, organizationId),
          inArray(schema.patient.id, patientIdsToday),
        ),
      )
    const emailToPatientId = new Map(
      patientEmails.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p.id]),
    )
    if (emailToPatientId.size > 0) {
      const unpaid = await db
        .select({ email: schema.customers.email })
        .from(schema.invoices)
        .innerJoin(
          schema.customers,
          eq(schema.invoices.customerId, schema.customers.id),
        )
        .where(
          and(
            eq(schema.invoices.organizationId, organizationId),
            inArray(schema.invoices.status, ['pending', 'overdue']),
            inArray(
              schema.customers.email,
              Array.from(emailToPatientId.keys()),
            ),
          ),
        )
      for (const u of unpaid) {
        const pid = emailToPatientId.get(u.email.toLowerCase())
        if (pid) balanceSet.add(pid)
      }
    }

    // Intake submissions on file
    const submissions = await db
      .select({ patientId: schema.formSubmission.patientId })
      .from(schema.formSubmission)
      .where(
        and(
          eq(schema.formSubmission.organizationId, organizationId),
          inArray(
            schema.formSubmission.patientId,
            patientIdsToday,
          ),
        ),
      )
    for (const s of submissions) {
      if (s.patientId) intakeSet.add(s.patientId)
    }
  }

  const todaysAppointments: TodayAppointmentRow[] = todaysAppts.map((a) => ({
    id: a.id,
    patientId: a.patientId,
    patientName: `${a.firstName} ${a.lastName}`,
    startTime: a.startTime,
    endTime: a.endTime,
    type: a.type,
    status: a.status,
    flags: {
      newPatient: newPatientSet.has(a.patientId),
      birthdayThisWeek: isBirthdayThisWeek(a.dateOfBirth),
      hasOutstandingBalance: balanceSet.has(a.patientId),
      hasIntakeOnFile: intakeSet.has(a.patientId),
    },
  }))

  // ── Unconfirmed (next 48h) ──────────────────────────────────────────
  const unconfirmedRows = await db
    .select({
      id: schema.appointment.id,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      startTime: schema.appointment.startTime,
    })
    .from(schema.appointment)
    .innerJoin(schema.patient, eq(schema.appointment.patientId, schema.patient.id))
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        eq(schema.appointment.status, 'scheduled'),
        gte(schema.appointment.startTime, now),
        lte(schema.appointment.startTime, in48h),
      ),
    )
    .orderBy(asc(schema.appointment.startTime))

  const unconfirmed = {
    count: unconfirmedRows.length,
    preview: unconfirmedRows.slice(0, 3).map((r) => ({
      id: r.id,
      patientName: `${r.firstName} ${r.lastName}`,
      startTime: r.startTime,
    })),
  }

  // ── Intake submissions (last 7d) ────────────────────────────────────
  const intakeRows = await db
    .select({
      id: schema.formSubmission.id,
      title: schema.formTemplate.title,
      submitterName: schema.formSubmission.submitterName,
      submittedAt: schema.formSubmission.submittedAt,
    })
    .from(schema.formSubmission)
    .innerJoin(
      schema.formTemplate,
      eq(schema.formSubmission.formTemplateId, schema.formTemplate.id),
    )
    .where(
      and(
        eq(schema.formSubmission.organizationId, organizationId),
        gte(schema.formSubmission.submittedAt, since7d),
      ),
    )
    .orderBy(desc(schema.formSubmission.submittedAt))

  const intakeSubmissions = {
    count: intakeRows.length,
    preview: intakeRows.slice(0, 3).map((r) => ({
      id: r.id,
      formTitle: r.title,
      submitterName: r.submitterName,
      submittedAt: r.submittedAt,
    })),
  }

  // ── Outstanding balances ────────────────────────────────────────────
  const [balanceRow] = await db
    .select({
      count: count(),
      totalCents: sql<number>`coalesce(sum(${schema.invoices.totalCents}), 0)::int`,
    })
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.organizationId, organizationId),
        inArray(schema.invoices.status, ['pending', 'overdue']),
      ),
    )

  const outstandingBalances = {
    count: Number(balanceRow?.count ?? 0),
    totalCents: Number(balanceRow?.totalCents ?? 0),
  }

  // ── Trend tiles ─────────────────────────────────────────────────────
  const [bookingsTodayRow] = await db
    .select({ count: count() })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        gte(schema.appointment.createdAt, todayStart),
      ),
    )

  const [newPatientsMTDRow] = await db
    .select({ count: count() })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        gte(schema.patient.createdAt, monthStart),
      ),
    )

  const [newPatientsLastMTDRow] = await db
    .select({ count: count() })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        gte(schema.patient.createdAt, lastMonthStart),
        lte(schema.patient.createdAt, lastMonthEnd),
      ),
    )

  const [upcomingRow] = await db
    .select({ count: count() })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        gte(schema.appointment.startTime, now),
        lte(schema.appointment.startTime, in7d),
        ne(schema.appointment.status, 'cancelled'),
        ne(schema.appointment.status, 'no_show'),
      ),
    )

  const [activeFormsRow] = await db
    .select({ count: count() })
    .from(schema.formTemplate)
    .where(
      and(
        eq(schema.formTemplate.organizationId, organizationId),
        sql`${schema.formTemplate.archivedAt} is null`,
      ),
    )

  const trends = {
    bookingsToday: Number(bookingsTodayRow?.count ?? 0),
    newPatientsMTD: Number(newPatientsMTDRow?.count ?? 0),
    newPatientsLastMTD: Number(newPatientsLastMTDRow?.count ?? 0),
    upcomingNext7d: Number(upcomingRow?.count ?? 0),
    activeIntakeForms: Number(activeFormsRow?.count ?? 0),
  }

  // ── Recent activity (mixed feed, last 10) ───────────────────────────
  // Pull last few of each kind in parallel, merge, sort, slice.
  const [recentAppts, recentIntake, recentPaid, recentPatients] = await Promise.all([
    db
      .select({
        id: schema.appointment.id,
        createdAt: schema.appointment.createdAt,
        firstName: schema.patient.firstName,
        lastName: schema.patient.lastName,
        type: schema.appointment.type,
        startTime: schema.appointment.startTime,
      })
      .from(schema.appointment)
      .innerJoin(schema.patient, eq(schema.appointment.patientId, schema.patient.id))
      .where(eq(schema.appointment.organizationId, organizationId))
      .orderBy(desc(schema.appointment.createdAt))
      .limit(10),
    db
      .select({
        id: schema.formSubmission.id,
        submittedAt: schema.formSubmission.submittedAt,
        submitterName: schema.formSubmission.submitterName,
        title: schema.formTemplate.title,
      })
      .from(schema.formSubmission)
      .innerJoin(
        schema.formTemplate,
        eq(schema.formSubmission.formTemplateId, schema.formTemplate.id),
      )
      .where(eq(schema.formSubmission.organizationId, organizationId))
      .orderBy(desc(schema.formSubmission.submittedAt))
      .limit(10),
    db
      .select({
        id: schema.invoices.id,
        paidAt: schema.invoices.paidAt,
        invoiceNumber: schema.invoices.invoiceNumber,
        totalCents: schema.invoices.totalCents,
        customerName: schema.customers.name,
      })
      .from(schema.invoices)
      .leftJoin(schema.customers, eq(schema.invoices.customerId, schema.customers.id))
      .where(
        and(
          eq(schema.invoices.organizationId, organizationId),
          eq(schema.invoices.status, 'paid'),
        ),
      )
      .orderBy(desc(schema.invoices.paidAt))
      .limit(10),
    db
      .select({
        id: schema.patient.id,
        createdAt: schema.patient.createdAt,
        firstName: schema.patient.firstName,
        lastName: schema.patient.lastName,
      })
      .from(schema.patient)
      .where(eq(schema.patient.organizationId, organizationId))
      .orderBy(desc(schema.patient.createdAt))
      .limit(10),
  ])

  const activity: ActivityRow[] = []
  for (const a of recentAppts) {
    activity.push({
      id: `appt_${a.id}`,
      kind: 'appointment_booked',
      occurredAt: a.createdAt,
      title: `${a.firstName} ${a.lastName} booked ${a.type.replace('_', ' ')}`,
      subtitle: `for ${a.startTime.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
      href: '/appointments',
    })
  }
  for (const s of recentIntake) {
    activity.push({
      id: `sub_${s.id}`,
      kind: 'intake_submitted',
      occurredAt: s.submittedAt,
      title: `${s.submitterName ?? 'Patient'} submitted ${s.title}`,
      subtitle: 'Intake form',
      href: '/intake-forms',
    })
  }
  for (const p of recentPaid) {
    if (!p.paidAt) continue
    activity.push({
      id: `inv_${p.id}`,
      kind: 'invoice_paid',
      occurredAt: p.paidAt,
      title: `${p.customerName ?? 'Customer'} paid ${p.invoiceNumber}`,
      subtitle: `$${(p.totalCents / 100).toFixed(2)}`,
      href: '/ecommerce/invoices',
    })
  }
  for (const p of recentPatients) {
    activity.push({
      id: `pat_${p.id}`,
      kind: 'patient_added',
      occurredAt: p.createdAt,
      title: `${p.firstName} ${p.lastName} added as a patient`,
      subtitle: null,
      href: `/patients/${p.id}`,
    })
  }
  activity.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
  const recentActivity = activity.slice(0, 10)

  return {
    date: now,
    todaysAppointments,
    unconfirmed,
    intakeSubmissions,
    outstandingBalances,
    trends,
    recentActivity,
  }
}
