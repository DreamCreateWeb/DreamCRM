import 'server-only'
import { and, asc, between, count, desc, eq, gte, inArray, isNotNull, lte, ne, notInArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getIntegrationsHealth, type IntegrationsHealth } from '@/lib/services/pms/health'
import { getReviewStats } from '@/lib/services/reviews'
import { getInboxStats } from '@/lib/services/patient-messaging'
import { getFollowupSummary, type FollowupSummary } from '@/lib/services/patient-followups'
import { getTagsForPatients } from '@/lib/services/patient-tags'
import type { PatientTagView } from '@/lib/types/patient-tags'
import { isBirthdayThisWeek } from '@/lib/dates'
import { BACKFILL_PATIENT_SOURCES } from '@/lib/services/analytics'
import { clinicDayStart, clinicMonthStart } from '@/lib/clinic-timezone'
import { getSiteTraffic, type SiteTraffic } from '@/lib/services/site-analytics'
import { websiteHealthNotice, type WebsiteHealthNotice } from '@/lib/website-health'
import { formatClinicDayTime } from '@/lib/format-datetime'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'

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
  /** The clinic's IANA timezone — every time rendered from this snapshot must
   *  format against it (the server clock is UTC). */
  timeZone: string
  todaysAppointments: TodayAppointmentRow[]
  unconfirmed: {
    count: number
    preview: AppointmentPreviewRow[]
  }
  intakeSubmissions: {
    count: number
    preview: IntakeSubmissionPreviewRow[]
  }
  // Outstanding balances — aggregated from PMS-synced `patient.pms_balance_cents`
  // (the only system that knows the clinical ledger), NOT the legacy invoices
  // table. count = patients with a positive PMS balance.
  outstandingBalances: {
    count: number
    totalCents: number
  }
  newLeads: {
    count: number
    preview: LeadPreviewRow[]
  }
  /** The website's check-engine light — traffic drop / silent forms; null
   *  when healthy or when the reads failed (never false-alarms). */
  siteHealth: WebsiteHealthNotice | null
  /** Paid shop orders still awaiting fulfillment — your move to ship/ready. */
  paidOrdersUnfulfilled: number
  /** Unread inbound patient messages (the ball is in our court). */
  unreadMessages: number
  /** Reviews completed in the last 30 days + how many requests went out. */
  reviewsReceived: {
    completed30d: number
    sent30d: number
  }
  trends: {
    bookingsToday: number
    newPatientsMTD: number
    newPatientsLastMTD: number
    upcomingNext7d: number
    activeIntakeForms: number
  }
  recentActivity: ActivityRow[]
  integrationsHealth: IntegrationsHealth | null
  /** Website traffic, last 7 days (total + delta + top page) — the "is my
   *  site working" signal on the morning-huddle screen. Best-effort: a
   *  failure yields null and the card simply doesn't render. */
  siteTraffic: SiteTraffic | null
  /** Open patient follow-ups + how many are overdue / due today (morning huddle). */
  followups: FollowupSummary
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
  /** CRM tags on the patient — shown on the today's-chair row. */
  tags: PatientTagView[]
}

export interface LeadPreviewRow {
  id: string
  name: string
  phone: string
  createdAt: Date
  ageHours: number
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

export async function getClinicOverview(organizationId: string): Promise<ClinicOverviewData> {
  const now = new Date()
  // "Today" (and month boundaries) follow the CLINIC's calendar, not the
  // server's UTC clock — a 7:30 PM Central visit is tomorrow in UTC and would
  // vanish from a UTC-bounded today's-chair.
  const timeZone = await getClinicTimeZone(organizationId)
  const todayStart = clinicDayStart(now, timeZone)
  const todayEnd = new Date(clinicDayStart(now, timeZone, 1).getTime() - 1)
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthStart = clinicMonthStart(now, timeZone)
  const lastMonthStart = clinicMonthStart(now, timeZone, -1)
  const lastMonthEnd = monthStart // exclusive upper bound

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
      pmsBalanceCents: schema.patient.pmsBalanceCents,
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

  // Per-patient glyph flags for today's chair: first-ever appointment (new
  // patient) and intake-on-file. Balance reads straight off the patient join
  // above (pms_balance_cents) — the same source the Patients list + the
  // outstanding-balances KPI below use, so the $ glyph agrees across screens.
  const patientIdsToday = Array.from(new Set(todaysAppts.map((a) => a.patientId)))

  const newPatientSet = new Set<string>()
  const balanceSet = new Set<string>()
  const intakeSet = new Set<string>()

  for (const a of todaysAppts) {
    if ((a.pmsBalanceCents ?? 0) > 0) balanceSet.add(a.patientId)
  }

  if (patientIdsToday.length > 0) {
    const [priors, submissions] = await Promise.all([
      // Patients with no REAL appointment before today → new patient.
      // Cancelled/no-show priors don't count as a visit — matches the agenda
      // + patients-list rule so the ★ glyph agrees across surfaces.
      db
        .select({ patientId: schema.appointment.patientId })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, organizationId),
            inArray(schema.appointment.patientId, patientIdsToday),
            lte(schema.appointment.startTime, todayStart),
            notInArray(schema.appointment.status, ['cancelled', 'no_show']),
          ),
        ),
      // Intake submissions on file.
      db
        .select({ patientId: schema.formSubmission.patientId })
        .from(schema.formSubmission)
        .where(
          and(
            eq(schema.formSubmission.organizationId, organizationId),
            inArray(schema.formSubmission.patientId, patientIdsToday),
          ),
        ),
    ])
    const hasPrior = new Set(priors.map((p) => p.patientId))
    for (const id of patientIdsToday) {
      if (!hasPrior.has(id)) newPatientSet.add(id)
    }
    for (const s of submissions) {
      if (s.patientId) intakeSet.add(s.patientId)
    }
  }

  // CRM tags for today's chair — who's VIP / anxious, at a glance.
  const todaysTagsByPatient = await getTagsForPatients(
    organizationId,
    todaysAppts.map((a) => a.patientId),
  )
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
      birthdayThisWeek: isBirthdayThisWeek(a.dateOfBirth, now),
      hasOutstandingBalance: balanceSet.has(a.patientId),
      hasIntakeOnFile: intakeSet.has(a.patientId),
    },
    tags: todaysTagsByPatient.get(a.patientId) ?? [],
  }))

  // ── Attention signals — unconfirmed / intake / balances / leads ────────
  // All four are independent; one parallel batch instead of four serial hops.
  const [unconfirmedRows, intakeRows, balanceRowArr, leadRows] = await Promise.all([
    // Unconfirmed (next 48h)
    db
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
      .orderBy(asc(schema.appointment.startTime)),
    // Intake submissions (last 7d)
    db
      .select({
        id: schema.formSubmission.id,
        title: schema.formTemplate.title,
        submitterName: schema.formSubmission.submitterName,
        submittedAt: schema.formSubmission.submittedAt,
      })
      .from(schema.formSubmission)
      .innerJoin(schema.formTemplate, eq(schema.formSubmission.formTemplateId, schema.formTemplate.id))
      .where(
        and(
          eq(schema.formSubmission.organizationId, organizationId),
          gte(schema.formSubmission.submittedAt, since7d),
        ),
      )
      .orderBy(desc(schema.formSubmission.submittedAt)),
    // Outstanding balances (PMS sync, not legacy invoices)
    db
      .select({
        count: count(),
        totalCents: sql<number>`coalesce(sum(${schema.patient.pmsBalanceCents}), 0)::bigint`,
      })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, organizationId),
          eq(schema.patient.isActive, 1),
          sql`${schema.patient.pmsBalanceCents} > 0`,
        ),
      ),
    // New leads (untouched website inquiries)
    db
      .select({
        id: schema.lead.id,
        name: schema.lead.name,
        phone: schema.lead.phone,
        createdAt: schema.lead.createdAt,
      })
      .from(schema.lead)
      .where(and(eq(schema.lead.organizationId, organizationId), eq(schema.lead.status, 'new')))
      .orderBy(desc(schema.lead.createdAt))
      .limit(5),
  ])
  const balanceRow = balanceRowArr[0]

  const unconfirmed = {
    count: unconfirmedRows.length,
    preview: unconfirmedRows.slice(0, 3).map((r) => ({
      id: r.id,
      patientName: `${r.firstName} ${r.lastName}`,
      startTime: r.startTime,
    })),
  }

  const intakeSubmissions = {
    count: intakeRows.length,
    preview: intakeRows.slice(0, 3).map((r) => ({
      id: r.id,
      formTitle: r.title,
      submitterName: r.submitterName,
      submittedAt: r.submittedAt,
    })),
  }

  const outstandingBalances = {
    count: Number(balanceRow?.count ?? 0),
    totalCents: Number(balanceRow?.totalCents ?? 0),
  }

  const newLeads = {
    count: leadRows.length,
    preview: leadRows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      createdAt: r.createdAt,
      ageHours: Math.round((now.getTime() - r.createdAt.getTime()) / (60 * 60 * 1000)),
    })),
  }

  // ── Trend tiles — five independent counts, one parallel batch ──────────
  const [bookingsTodayRow, newPatientsMTDRow, newPatientsLastMTDRow, upcomingRow, activeFormsRow] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(schema.appointment)
        .where(and(eq(schema.appointment.organizationId, organizationId), gte(schema.appointment.createdAt, todayStart)))
        .then((r) => r[0]),
      // New patients MTD — same acquisition semantics as Analytics
      // (lib/services/analytics.ts): firstSeenAt is the honest field, archived
      // patients don't count, and bulk backfills (PMS/CSV import) are excluded
      // so connecting a PMS doesn't spike the tile by the whole roster.
      db
        .select({ source: schema.patient.source })
        .from(schema.patient)
        .where(
          and(
            eq(schema.patient.organizationId, organizationId),
            isNotNull(schema.patient.firstSeenAt),
            gte(schema.patient.firstSeenAt, monthStart),
            ne(schema.patient.lifecycle, 'archived'),
          ),
        )
        .then((rows) => ({ count: rows.filter((r) => !BACKFILL_PATIENT_SOURCES.has(r.source ?? '')).length })),
      db
        .select({ source: schema.patient.source })
        .from(schema.patient)
        .where(
          and(
            eq(schema.patient.organizationId, organizationId),
            isNotNull(schema.patient.firstSeenAt),
            gte(schema.patient.firstSeenAt, lastMonthStart),
            lte(schema.patient.firstSeenAt, lastMonthEnd),
            ne(schema.patient.lifecycle, 'archived'),
          ),
        )
        .then((rows) => ({ count: rows.filter((r) => !BACKFILL_PATIENT_SOURCES.has(r.source ?? '')).length })),
      db
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
        .then((r) => r[0]),
      db
        .select({ count: count() })
        .from(schema.formTemplate)
        .where(and(eq(schema.formTemplate.organizationId, organizationId), sql`${schema.formTemplate.archivedAt} is null`))
        .then((r) => r[0]),
    ])

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
      subtitle: `for ${formatClinicDayTime(a.startTime, timeZone)}`,
      href: `/appointments?appt=${a.id}`,
    })
  }
  for (const s of recentIntake) {
    activity.push({
      id: `sub_${s.id}`,
      kind: 'intake_submitted',
      occurredAt: s.submittedAt,
      title: `${s.submitterName ?? 'Patient'} submitted ${s.title}`,
      subtitle: 'Intake form',
      href: `/intake-forms/submissions/${s.id}`,
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
      href: '/payments/online',
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

  // ── Extra attention signals (reuse existing services) ───────────────
  const [integrationsHealth, paidUnfulfilledRow, reviewStats, inboxStats, followups, siteTraffic, leads14d, domainState] = await Promise.all([
    getIntegrationsHealth(organizationId, now),
    // Paid shop orders still awaiting fulfillment (our move).
    db
      .select({ count: count() })
      .from(schema.shopOrder)
      .where(
        and(
          eq(schema.shopOrder.organizationId, organizationId),
          eq(schema.shopOrder.status, 'paid'),
          eq(schema.shopOrder.fulfillmentStatus, 'unfulfilled'),
        ),
      ),
    getReviewStats(organizationId),
    // currentUserId isn't used for the unread count (the service `void`s it).
    getInboxStats(organizationId, ''),
    getFollowupSummary(organizationId, now),
    // Website visits are an enrichment, never a reason the huddle fails.
    getSiteTraffic(organizationId, 7).catch(() => null),
    // 14-day lead count for the silent-forms signal — null on failure so the
    // signal can never false-alarm off a hiccup.
    db
      .select({ count: count() })
      .from(schema.lead)
      .where(and(eq(schema.lead.organizationId, organizationId), gte(schema.lead.createdAt, new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000))))
      .then((r) => Number(r[0]?.count ?? 0))
      .catch(() => null as number | null),
    // Custom-domain state for the stuck-DNS / failed-domain banner branches —
    // best-effort; null (no domain / read hiccup) simply skips those signals.
    db
      .select({ status: schema.clinicProfile.customDomainStatus })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
      .then((r) => {
        const st = r[0]?.status as { state?: string } | null | undefined
        const state = st?.state
        return state === 'pending_dns' || state === 'active' || state === 'failed' ? state : null
      })
      .catch(() => null),
  ])

  return {
    date: now,
    timeZone,
    todaysAppointments,
    unconfirmed,
    intakeSubmissions,
    outstandingBalances,
    newLeads,
    paidOrdersUnfulfilled: Number(paidUnfulfilledRow[0]?.count ?? 0),
    unreadMessages: inboxStats.unread,
    reviewsReceived: { completed30d: reviewStats.completed30d, sent30d: reviewStats.sent30d },
    trends,
    recentActivity,
    integrationsHealth,
    followups,
    siteTraffic,
    siteHealth: siteTraffic
      ? websiteHealthNotice({ total: siteTraffic.total, totalPrev: siteTraffic.totalPrev, leads14d, domainState })
      : null,
  }
}
