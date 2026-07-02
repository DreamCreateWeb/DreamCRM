import 'server-only'
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { randomBytes } from 'crypto'
import { queueAppointmentWriteBack, queueAppointmentStatusWriteBack } from '@/lib/services/pms'
import { getTagsForPatients, getTagsForPatient } from '@/lib/services/patient-tags'
import type { PatientTagView } from '@/lib/types/patient-tags'
import { toCsv } from '@/lib/csv'
import { clinicDayStart, clinicWeekStart } from '@/lib/clinic-timezone'
import { clinicDayKey } from '@/lib/format-datetime'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { isBirthdayThisWeek, lapsedCutoff as lapsedCutoffDate } from '@/lib/dates'
import { getClinicCadence } from '@/lib/services/clinic-cadence'

/**
 * Appointments service — the relationship-view of the schedule.
 *
 * Per the research doc: we do NOT own the clinical schedule. The PMS
 * owns operatories, production, procedure codes, claims, charting,
 * hygiene capacity planning. We own the bookings that flow through
 * our orbital surfaces (booking widget, future call-pop, intake nudges,
 * marketing click-to-book) — and the workflows to confirm, reschedule,
 * cancel, and chase no-shows on those bookings.
 */

// ----- Public types -----------------------------------------------------

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
export type AppointmentSource = 'booking_widget' | 'portal' | 'manual' | 'recall_campaign' | 'phone' | 'invite'
export type AppointmentChannel = 'sms' | 'email'

/** Glyphs that travel from Patients onto the agenda row + 3 appointment-scoped additions. */
export interface AppointmentRowFlags {
  newPatient: boolean
  birthdayThisWeek: boolean
  hasOutstandingBalance: boolean
  missingIntakeBeforeAppt: boolean
  unconfirmedNext48h: boolean
  lapsedReturning: boolean
  optedOut: boolean
  reminderSentRecently: boolean
  bookedJustNow: boolean
  rescheduled: boolean
}

/** Tier of the aging signal — drives the left-border color on the row. */
export type AgingLevel = 'none' | 'neutral' | 'amber' | 'darkAmber' | 'red'

export interface AppointmentRow {
  id: string
  patientId: string
  patientName: string
  patientLifecycle: string
  startTime: Date
  endTime: Date | null
  durationMinutes: number | null
  type: string
  status: AppointmentStatus
  source: string | null
  notes: string | null
  providerId: string | null
  providerName: string | null
  locationName: string | null
  confirmedAt: Date | null
  cancelledAt: Date | null
  reminderLastSentAt: Date | null
  createdAt: Date
  flags: AppointmentRowFlags
  agingLevel: AgingLevel
  /** Recovery queue: a cancelled / no-show visit (in the last 60 days) whose
   *  patient has NO future appointment booked — a candidate to chase + rebook. */
  needsRebooking: boolean
  /** CRM tags on the patient — surfaced on the agenda row + drawer. */
  tags: PatientTagView[]
}

export interface AppointmentListFilters {
  /** Date-window chip — exactly one. */
  window?: 'today' | 'tomorrow' | 'this_week' | 'next_14d' | 'all_upcoming' | 'past_30d'
  /** Needs-attention multi-select chips. */
  attention?: Array<'unconfirmed' | 'needs_intake' | 'new_patients' | 'has_balance' | 'cancelled' | 'no_show' | 'lapsed_rebooking' | 'needs_rebooking'>
  /** Filter to one staff member. */
  providerId?: string
  /** Filter to one booking channel ('booking_widget' / 'portal' / 'phone' / etc.). */
  source?: string
  /** Fuzzy search across patient name / email / phone / notes. */
  search?: string
}

export interface AppointmentDetail extends AppointmentRow {
  patient: {
    id: string
    fullName: string
    email: string | null
    phone: string | null
    dateOfBirth: string | null
    lifecycle: string
    hasPortalAccount: boolean
    outstandingBalanceCents: number
    lifetimeValueCents: number
    lastVisitAt: Date | null
    totalBookings: number
  }
  reminders: Array<{
    id: string
    channel: AppointmentChannel
    template: string | null
    sentAt: Date
    sentByName: string | null
    deliveredAt: Date | null
    repliedAt: Date | null
    replyBody: string | null
  }>
  intakeAttached: { id: string; formTitle: string; submittedAt: Date } | null
  /** Booking deposit collected (or awaited) for this visit. Null = none. */
  deposit: { amountCents: number; status: string } | null
}

// ----- ID + helpers -----------------------------------------------------

export function newAppointmentId(): string {
  return `appt_${randomBytes(10).toString('hex')}`
}

export function newReminderLogId(): string {
  return `rem_${randomBytes(10).toString('hex')}`
}

export function newProviderId(): string {
  return `prov_${randomBytes(10).toString('hex')}`
}

// Treat reminders sent in last 24h as "recently" → triggers ⏱ glyph.
const REMINDER_RECENT_MS = 24 * 60 * 60 * 1000
// Booked-just-now glyph window: 1 hour.
const JUST_BOOKED_MS = 60 * 60 * 1000
// Rebooking recovery window: cancelled/no-show in the last 60 days with no
// future booking → "needs rebooking".
const REBOOK_WINDOW_MS = 60 * 24 * 60 * 60 * 1000

// Exported for testability. Computes the aging-color tier for the left
// border on a row. Only ever non-`none` when the row is unconfirmed —
// confirmed/completed/cancelled/no_show rows render with no aging tint.
export function computeAging(startTime: Date, status: AppointmentStatus, now: Date): AgingLevel {
  if (status !== 'scheduled') return 'none'
  const msUntil = startTime.getTime() - now.getTime()
  if (msUntil < 0) return 'red' // overdue + unconfirmed
  const hoursUntil = msUntil / (60 * 60 * 1000)
  if (hoursUntil <= 12) return 'red'
  if (hoursUntil <= 24) return 'darkAmber'
  if (hoursUntil <= 48) return 'amber'
  if (hoursUntil <= 72) return 'neutral'
  return 'none'
}

/**
 * Pure rebooking-candidate test (exported for unit testing). A row belongs in
 * the recovery queue when it's a cancelled / no-show visit within the last 60
 * days AND the patient has no future (non-cancelled) appointment booked.
 */
export function isRebookingCandidate(opts: {
  status: AppointmentStatus
  startTime: Date
  hasFutureAppt: boolean
  now: Date
}): boolean {
  if (opts.status !== 'cancelled' && opts.status !== 'no_show') return false
  if (opts.startTime < new Date(opts.now.getTime() - REBOOK_WINDOW_MS)) return false
  return !opts.hasFutureAppt
}

// ----- Date-window resolver -----

// Windows are bounded at the CLINIC's calendar days, not the server's UTC
// days — a 7:30 PM Central visit is already "tomorrow" in UTC and would fall
// out of a UTC-bounded "Today" chip.
function resolveWindow(
  window: AppointmentListFilters['window'],
  now: Date,
  timeZone: string,
): { from: Date; to: Date; isPast: boolean } {
  switch (window) {
    case 'today':
      return { from: clinicDayStart(now, timeZone), to: clinicDayStart(now, timeZone, 1), isPast: false }
    case 'tomorrow':
      return { from: clinicDayStart(now, timeZone, 1), to: clinicDayStart(now, timeZone, 2), isPast: false }
    case 'this_week': {
      const start = clinicWeekStart(now, timeZone)
      const end = clinicDayStart(start, timeZone, 7)
      return { from: start, to: end, isPast: false }
    }
    case 'next_14d':
      return { from: clinicDayStart(now, timeZone), to: clinicDayStart(now, timeZone, 14), isPast: false }
    case 'past_30d':
      return { from: clinicDayStart(now, timeZone, -30), to: clinicDayStart(now, timeZone), isPast: true }
    case 'all_upcoming':
    default:
      // 90 days forward as a hard ceiling so we don't try to render
      // year-long futures on the agenda.
      return { from: clinicDayStart(now, timeZone), to: clinicDayStart(now, timeZone, 90), isPast: false }
  }
}

// ----- List page --------------------------------------------------------

export async function listAppointments(
  organizationId: string,
  filters: AppointmentListFilters = {},
): Promise<AppointmentRow[]> {
  const now = new Date()
  const timeZone = await getClinicTimeZone(organizationId)
  const win = resolveWindow(filters.window, now, timeZone)
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Base where: org + window. Status filter is applied post-query only for
  // attention chips that map to specific statuses; otherwise SQL handles it.
  const where = [
    eq(schema.appointment.organizationId, organizationId),
    gte(schema.appointment.startTime, win.from),
    lte(schema.appointment.startTime, win.to),
  ]
  if (filters.providerId) {
    where.push(eq(schema.appointment.providerId, filters.providerId))
  }
  if (filters.source) {
    where.push(eq(schema.appointment.source, filters.source))
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim().toLowerCase()}%`
    const phoneDigits = filters.search.replace(/\D/g, '')
    const phoneQ = phoneDigits.length >= 3 ? `%${phoneDigits}%` : null
    where.push(
      or(
        sql`lower(${schema.patient.firstName}) like ${q}`,
        sql`lower(${schema.patient.lastName}) like ${q}`,
        sql`lower(${schema.patient.firstName} || ' ' || ${schema.patient.lastName}) like ${q}`,
        sql`lower(coalesce(${schema.patient.email}, '')) like ${q}`,
        sql`lower(coalesce(${schema.appointment.notes}, '')) like ${q}`,
        phoneQ
          ? sql`regexp_replace(coalesce(${schema.patient.phone}, ''), '\\D', '', 'g') like ${phoneQ}`
          : sql`false`,
      )!,
    )
  }

  const rows = await db
    .select({
      id: schema.appointment.id,
      patientId: schema.appointment.patientId,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      dateOfBirth: schema.patient.dateOfBirth,
      patientEmail: schema.patient.email,
      patientLifecycle: schema.patient.lifecycle,
      startTime: schema.appointment.startTime,
      endTime: schema.appointment.endTime,
      type: schema.appointment.type,
      status: schema.appointment.status,
      source: schema.appointment.source,
      notes: schema.appointment.notes,
      providerId: schema.appointment.providerId,
      providerName: schema.clinicProvider.displayName,
      locationName: schema.clinicLocation.name,
      confirmedAt: schema.appointment.confirmedAt,
      cancelledAt: schema.appointment.cancelledAt,
      rescheduledFromAppointmentId: schema.appointment.rescheduledFromAppointmentId,
      createdAt: schema.appointment.createdAt,
      pmsBalanceCents: schema.patient.pmsBalanceCents,
    })
    .from(schema.appointment)
    .innerJoin(schema.patient, eq(schema.appointment.patientId, schema.patient.id))
    .leftJoin(schema.clinicProvider, eq(schema.appointment.providerId, schema.clinicProvider.id))
    .leftJoin(schema.clinicLocation, eq(schema.appointment.locationId, schema.clinicLocation.id))
    .where(and(...where))
    .orderBy(win.isPast ? desc(schema.appointment.startTime) : asc(schema.appointment.startTime))

  if (rows.length === 0) return []

  const apptIds = rows.map((r) => r.id)
  const patientIds = Array.from(new Set(rows.map((r) => r.patientId)))

  // Fan-out queries for derived signal columns. All parallel. (Balance is read
  // straight off the patient join above — pms_balance_cents, the same source
  // the Patients list + Overview KPI use — so the $ glyph agrees everywhere.)
  const [intakeRows, lastReminderRows, priorAppts, futureAppts, cadence] = await Promise.all([
    // Intake submission tied to this appointment specifically.
    db
      .select({ appointmentId: schema.formSubmission.appointmentId, patientId: schema.formSubmission.patientId })
      .from(schema.formSubmission)
      .where(
        and(
          eq(schema.formSubmission.organizationId, organizationId),
          or(
            inArray(schema.formSubmission.appointmentId, apptIds),
            inArray(schema.formSubmission.patientId, patientIds),
          )!,
        ),
      ),
    // Most recent reminder per appointment.
    db
      .select({
        appointmentId: schema.appointmentReminderLog.appointmentId,
        sentAt: schema.appointmentReminderLog.sentAt,
      })
      .from(schema.appointmentReminderLog)
      .where(
        and(
          eq(schema.appointmentReminderLog.organizationId, organizationId),
          inArray(schema.appointmentReminderLog.appointmentId, apptIds),
        ),
      )
      .orderBy(desc(schema.appointmentReminderLog.sentAt)),
    // For each patient, the most recent *prior* completed appointment.
    // Used for new-patient detection (no prior) and lapsed-returning (prior > 9mo ago).
    db
      .select({
        patientId: schema.appointment.patientId,
        startTime: schema.appointment.startTime,
      })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.organizationId, organizationId),
          inArray(schema.appointment.patientId, patientIds),
          lte(schema.appointment.startTime, now),
          ne(schema.appointment.status, 'cancelled'),
          ne(schema.appointment.status, 'no_show'),
        ),
      )
      .orderBy(desc(schema.appointment.startTime)),
    // Patients in view who have ANY future (non-cancelled/no-show) appointment.
    // Drives the "needs rebooking" recovery flag: a cancelled/no-show row only
    // counts when the patient hasn't already rebooked something later.
    db
      .select({ patientId: schema.appointment.patientId })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.organizationId, organizationId),
          inArray(schema.appointment.patientId, patientIds),
          gte(schema.appointment.startTime, now),
          ne(schema.appointment.status, 'cancelled'),
          ne(schema.appointment.status, 'no_show'),
        ),
      ),
    getClinicCadence(organizationId),
  ])

  const lapsedCutoff = lapsedCutoffDate(now, cadence.lapsedMonths)

  // Per-appointment intake flag (this appointment OR this patient has any submission)
  const intakeApptSet = new Set<string>()
  const intakeAnyPatient = new Set<string>()
  for (const r of intakeRows) {
    if (r.appointmentId) intakeApptSet.add(r.appointmentId)
    if (r.patientId) intakeAnyPatient.add(r.patientId)
  }

  // Last reminder per appointment.
  const lastReminderByAppt = new Map<string, Date>()
  for (const r of lastReminderRows) {
    if (!lastReminderByAppt.has(r.appointmentId)) lastReminderByAppt.set(r.appointmentId, r.sentAt)
  }

  // Latest prior appointment per patient (the array is already sorted desc).
  const latestPriorByPatient = new Map<string, Date>()
  for (const r of priorAppts) {
    if (!latestPriorByPatient.has(r.patientId)) latestPriorByPatient.set(r.patientId, r.startTime)
  }

  // Patients with any future booking — used to suppress the rebooking flag.
  const hasFutureByPatient = new Set<string>()
  for (const r of futureAppts) hasFutureByPatient.add(r.patientId)

  // CRM tags per patient — so the schedule shows who's VIP / anxious at a glance.
  const tagsByPatient = await getTagsForPatients(organizationId, patientIds)

  const result: AppointmentRow[] = rows.map((r) => {
    const status = r.status as AppointmentStatus
    const lastVisit = latestPriorByPatient.get(r.patientId) ?? null
    const newPatient = !lastVisit && r.startTime > now
    const lapsed = !!lastVisit && lastVisit < lapsedCutoff
    const lastReminder = lastReminderByAppt.get(r.id) ?? null
    const hasIntake = intakeApptSet.has(r.id) || intakeAnyPatient.has(r.patientId)
    const isFuture = r.startTime > now
    const balance = r.pmsBalanceCents ?? 0
    const duration =
      r.endTime ? Math.max(15, Math.round((r.endTime.getTime() - r.startTime.getTime()) / 60000)) : null
    // Recovery queue: this row is a recent cancellation / no-show and the
    // patient has nothing booked ahead → chase + rebook.
    const needsRebooking = isRebookingCandidate({
      status,
      startTime: r.startTime,
      hasFutureAppt: hasFutureByPatient.has(r.patientId),
      now,
    })
    return {
      id: r.id,
      patientId: r.patientId,
      patientName: `${r.firstName} ${r.lastName}`,
      patientLifecycle: r.patientLifecycle ?? 'active',
      startTime: r.startTime,
      endTime: r.endTime,
      durationMinutes: duration,
      type: r.type,
      status,
      source: r.source,
      notes: r.notes,
      providerId: r.providerId,
      providerName: r.providerName,
      locationName: r.locationName,
      confirmedAt: r.confirmedAt,
      cancelledAt: r.cancelledAt,
      reminderLastSentAt: lastReminder,
      createdAt: r.createdAt,
      flags: {
        newPatient,
        birthdayThisWeek: isBirthdayThisWeek(r.dateOfBirth, now),
        hasOutstandingBalance: balance > 0,
        missingIntakeBeforeAppt: isFuture && !hasIntake,
        unconfirmedNext48h: status === 'scheduled' && r.startTime >= now && r.startTime <= in48h,
        // Celebrate lapsed-returning: future appointment for a patient who
        // was lapsed (last visit > 9mo ago).
        lapsedReturning: isFuture && lapsed,
        optedOut: false,
        reminderSentRecently: !!lastReminder && now.getTime() - lastReminder.getTime() < REMINDER_RECENT_MS,
        bookedJustNow: now.getTime() - r.createdAt.getTime() < JUST_BOOKED_MS,
        rescheduled: !!r.rescheduledFromAppointmentId,
      },
      agingLevel: computeAging(r.startTime, status, now),
      needsRebooking,
      tags: tagsByPatient.get(r.patientId) ?? [],
    }
  })

  // Attention chips — applied post-query because some require derived data.
  let filtered = result
  const att = filters.attention ?? []
  if (att.length > 0) {
    filtered = filtered.filter((row) => {
      if (att.includes('unconfirmed') && row.status === 'scheduled') return true
      if (att.includes('needs_intake') && row.flags.missingIntakeBeforeAppt) return true
      if (att.includes('new_patients') && row.flags.newPatient) return true
      if (att.includes('has_balance') && row.flags.hasOutstandingBalance) return true
      if (att.includes('cancelled') && row.status === 'cancelled') return true
      if (att.includes('no_show') && row.status === 'no_show') return true
      if (att.includes('lapsed_rebooking') && row.flags.lapsedReturning) return true
      if (att.includes('needs_rebooking') && row.needsRebooking) return true
      return false
    })
  }

  // Unconfirmed-only filter never includes past_30d / cancelled / no_show
  // unless explicitly checked — we already covered that via inclusion test.

  return ignore7d(filtered, in7d)
}

// Stub to silence unused-var; in7d is referenced inside the closure via
// missingIntakeBeforeAppt indirectly through isFuture. Kept as a no-op so
// future expansion (e.g. "intake-due-in-7d-only" filter) has a hook.
function ignore7d<T>(rows: T[], _in7d: Date): T[] { return rows }

// ----- Day grouping -----------------------------------------------------

export interface AppointmentDayGroup {
  date: Date
  label: string
  rows: AppointmentRow[]
  totals: { booked: number; confirmed: number; unconfirmed: number }
}

export function groupByDay(
  rows: AppointmentRow[],
  timeZone: string,
  now: Date = new Date(),
): AppointmentDayGroup[] {
  // Buckets + Today/Tomorrow labels follow the CLINIC's calendar day — a
  // 7 PM Central visit is already "tomorrow" in UTC and would otherwise land
  // under the wrong agenda day header (this runs in a server component).
  const todayKey = clinicDayKey(now, timeZone)
  const tomorrowKey = clinicDayKey(clinicDayStart(now, timeZone, 1), timeZone)
  const byKey = new Map<string, AppointmentRow[]>()
  for (const r of rows) {
    const k = clinicDayKey(r.startTime, timeZone)
    const arr = byKey.get(k) ?? []
    arr.push(r)
    byKey.set(k, arr)
  }
  const out: AppointmentDayGroup[] = []
  for (const [k, group] of Array.from(byKey.entries())) {
    const date = clinicDayStart(group[0].startTime, timeZone)
    const dayOpts = { weekday: 'long', month: 'short', day: 'numeric', timeZone } as const
    const label =
      k === todayKey
        ? 'Today · ' + group[0].startTime.toLocaleDateString('en-US', dayOpts)
        : k === tomorrowKey
          ? 'Tomorrow · ' + group[0].startTime.toLocaleDateString('en-US', dayOpts)
          : group[0].startTime.toLocaleDateString('en-US', { ...dayOpts, year: 'numeric' })
    // "Booked" = visits actually on the books that day — cancellations don't
    // count toward the day's chair load (they still render as rows).
    const totals = { booked: 0, confirmed: 0, unconfirmed: 0 }
    for (const r of group) {
      if (r.status !== 'cancelled') totals.booked += 1
      if (r.status === 'confirmed') totals.confirmed += 1
      else if (r.status === 'scheduled') totals.unconfirmed += 1
    }
    out.push({ date, label, rows: group, totals })
  }
  return out
}

// ----- Detail (drawer) --------------------------------------------------

export async function getAppointmentDetail(
  organizationId: string,
  appointmentId: string,
): Promise<AppointmentDetail | null> {
  const [base] = await db
    .select({
      id: schema.appointment.id,
      patientId: schema.appointment.patientId,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      dateOfBirth: schema.patient.dateOfBirth,
      patientEmail: schema.patient.email,
      patientPhone: schema.patient.phone,
      patientLifecycle: schema.patient.lifecycle,
      patientUserId: schema.patient.userId,
      startTime: schema.appointment.startTime,
      endTime: schema.appointment.endTime,
      type: schema.appointment.type,
      status: schema.appointment.status,
      source: schema.appointment.source,
      notes: schema.appointment.notes,
      providerId: schema.appointment.providerId,
      providerName: schema.clinicProvider.displayName,
      locationName: schema.clinicLocation.name,
      confirmedAt: schema.appointment.confirmedAt,
      cancelledAt: schema.appointment.cancelledAt,
      rescheduledFromAppointmentId: schema.appointment.rescheduledFromAppointmentId,
      createdAt: schema.appointment.createdAt,
      pmsBalanceCents: schema.patient.pmsBalanceCents,
    })
    .from(schema.appointment)
    .innerJoin(schema.patient, eq(schema.appointment.patientId, schema.patient.id))
    .leftJoin(schema.clinicProvider, eq(schema.appointment.providerId, schema.clinicProvider.id))
    .leftJoin(schema.clinicLocation, eq(schema.appointment.locationId, schema.clinicLocation.id))
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        eq(schema.appointment.id, appointmentId),
      ),
    )
    .limit(1)
  if (!base) return null

  const now = new Date()
  // Tags fold into the parallel batch (was a separate serial round-trip on
  // every drawer open). Balance reads off the patient join (pms_balance_cents).
  const [reminderRows, intakeRow, ltvRows, lastVisitRow, bookingCountRow, futureApptRow, tags, cadence, depositRow] = await Promise.all([
    db
      .select({
        id: schema.appointmentReminderLog.id,
        channel: schema.appointmentReminderLog.channel,
        template: schema.appointmentReminderLog.template,
        sentAt: schema.appointmentReminderLog.sentAt,
        sentByName: schema.user.name,
        deliveredAt: schema.appointmentReminderLog.deliveredAt,
        repliedAt: schema.appointmentReminderLog.repliedAt,
        replyBody: schema.appointmentReminderLog.replyBody,
      })
      .from(schema.appointmentReminderLog)
      .leftJoin(schema.user, eq(schema.appointmentReminderLog.sentByUserId, schema.user.id))
      .where(
        and(
          eq(schema.appointmentReminderLog.organizationId, organizationId),
          eq(schema.appointmentReminderLog.appointmentId, appointmentId),
        ),
      )
      .orderBy(desc(schema.appointmentReminderLog.sentAt)),
    db
      .select({
        id: schema.formSubmission.id,
        formTitle: schema.formTemplate.title,
        submittedAt: schema.formSubmission.submittedAt,
      })
      .from(schema.formSubmission)
      .innerJoin(schema.formTemplate, eq(schema.formSubmission.formTemplateId, schema.formTemplate.id))
      .where(
        and(
          eq(schema.formSubmission.organizationId, organizationId),
          or(
            eq(schema.formSubmission.appointmentId, appointmentId),
            eq(schema.formSubmission.patientId, base.patientId),
          )!,
        ),
      )
      .orderBy(desc(schema.formSubmission.submittedAt))
      .limit(1),
    // Shop spend — paid shop orders, the SAME source as the patients list's
    // "shop purchases" column (the legacy `invoices` join this replaced was
    // always $0 for real clinics: no dental flow writes invoices).
    db
      .select({ totalCents: schema.shopOrder.totalCents })
      .from(schema.shopOrder)
      .where(
        and(
          eq(schema.shopOrder.organizationId, organizationId),
          eq(schema.shopOrder.patientId, base.patientId),
          eq(schema.shopOrder.status, 'paid'),
        ),
      ),
    db
      .select({ startTime: schema.appointment.startTime })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.organizationId, organizationId),
          eq(schema.appointment.patientId, base.patientId),
          lte(schema.appointment.startTime, now),
          ne(schema.appointment.status, 'cancelled'),
          ne(schema.appointment.status, 'no_show'),
        ),
      )
      .orderBy(desc(schema.appointment.startTime))
      .limit(1),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.organizationId, organizationId),
          eq(schema.appointment.patientId, base.patientId),
        ),
      ),
    // Any future (non-cancelled/no-show) appointment for this patient — drives
    // the rebooking flag on a cancelled/no-show drawer row.
    db
      .select({ id: schema.appointment.id })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.organizationId, organizationId),
          eq(schema.appointment.patientId, base.patientId),
          gte(schema.appointment.startTime, now),
          ne(schema.appointment.status, 'cancelled'),
          ne(schema.appointment.status, 'no_show'),
        ),
      )
      .limit(1),
    getTagsForPatient(organizationId, base.patientId),
    getClinicCadence(organizationId),
    // Booking deposit on this visit (drawer pill: paid = money already down).
    db
      .select({ amountCents: schema.bookingDeposit.amountCents, status: schema.bookingDeposit.status })
      .from(schema.bookingDeposit)
      .where(
        and(
          eq(schema.bookingDeposit.organizationId, organizationId),
          eq(schema.bookingDeposit.appointmentId, appointmentId),
        ),
      )
      .orderBy(desc(schema.bookingDeposit.createdAt))
      .limit(1),
  ])

  const outstanding = base.pmsBalanceCents ?? 0
  const ltv = ltvRows.reduce<number>((acc, r) => acc + Number(r.totalCents ?? 0), 0)
  const status = base.status as AppointmentStatus
  const duration =
    base.endTime ? Math.max(15, Math.round((base.endTime.getTime() - base.startTime.getTime()) / 60000)) : null
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const lastVisit = lastVisitRow[0]?.startTime ?? null
  const lapsed = !!lastVisit && lastVisit < lapsedCutoffDate(now, cadence.lapsedMonths)
  const isFuture = base.startTime > now
  const newPatient = !lastVisit && isFuture
  const hasIntake = !!intakeRow[0]
  const reminderLastSentAt = reminderRows[0]?.sentAt ?? null
  const needsRebooking = isRebookingCandidate({
    status,
    startTime: base.startTime,
    hasFutureAppt: futureApptRow.length > 0,
    now,
  })

  return {
    id: base.id,
    patientId: base.patientId,
    patientName: `${base.firstName} ${base.lastName}`,
    patientLifecycle: base.patientLifecycle ?? 'active',
    startTime: base.startTime,
    endTime: base.endTime,
    durationMinutes: duration,
    type: base.type,
    status,
    source: base.source,
    notes: base.notes,
    providerId: base.providerId,
    providerName: base.providerName,
    locationName: base.locationName,
    confirmedAt: base.confirmedAt,
    cancelledAt: base.cancelledAt,
    reminderLastSentAt,
    createdAt: base.createdAt,
    flags: {
      newPatient,
      birthdayThisWeek: isBirthdayThisWeek(base.dateOfBirth, now),
      hasOutstandingBalance: outstanding > 0,
      missingIntakeBeforeAppt: isFuture && !hasIntake,
      unconfirmedNext48h: status === 'scheduled' && base.startTime >= now && base.startTime <= in48h,
      lapsedReturning: isFuture && lapsed,
      optedOut: false,
      reminderSentRecently: !!reminderLastSentAt && now.getTime() - reminderLastSentAt.getTime() < REMINDER_RECENT_MS,
      bookedJustNow: now.getTime() - base.createdAt.getTime() < JUST_BOOKED_MS,
      rescheduled: !!base.rescheduledFromAppointmentId,
    },
    agingLevel: computeAging(base.startTime, status, now),
    needsRebooking,
    tags,
    patient: {
      id: base.patientId,
      fullName: `${base.firstName} ${base.lastName}`,
      email: base.patientEmail,
      phone: base.patientPhone,
      dateOfBirth: base.dateOfBirth,
      lifecycle: base.patientLifecycle ?? 'active',
      hasPortalAccount: !!base.patientUserId,
      outstandingBalanceCents: outstanding,
      lifetimeValueCents: ltv,
      lastVisitAt: lastVisit,
      totalBookings: Number(bookingCountRow[0]?.count ?? 0),
    },
    reminders: reminderRows.map((r) => ({
      id: r.id,
      channel: r.channel as AppointmentChannel,
      template: r.template,
      sentAt: r.sentAt,
      sentByName: r.sentByName,
      deliveredAt: r.deliveredAt,
      repliedAt: r.repliedAt,
      replyBody: r.replyBody,
    })),
    intakeAttached: intakeRow[0]
      ? { id: intakeRow[0].id, formTitle: intakeRow[0].formTitle, submittedAt: intakeRow[0].submittedAt }
      : null,
    deposit: depositRow[0] ?? null,
  }
}

// ----- Status mutations -------------------------------------------------

async function setAppointmentState(
  organizationId: string,
  appointmentId: string,
  patch: Partial<typeof schema.appointment.$inferInsert>,
) {
  await db
    .update(schema.appointment)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        eq(schema.appointment.id, appointmentId),
      ),
    )
}

/**
 * Terminal states — a cancelled or completed visit shouldn't transition again.
 * Without this guard the server actions (callable directly, or via a stale UI /
 * double-click race) silently allow illegal transitions: e.g. rescheduling a
 * cancelled appointment resurrects it as a fresh `scheduled` row, or
 * `markCompleted` overwrites a cancelled visit. The UI gates these, but a page
 * redirect / hidden button is not an authorization check.
 */
const TERMINAL_APPOINTMENT_STATUSES = new Set(['cancelled', 'completed'])

async function assertAppointmentMutable(organizationId: string, appointmentId: string): Promise<string> {
  const [row] = await db
    .select({ status: schema.appointment.status })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        eq(schema.appointment.id, appointmentId),
      ),
    )
    .limit(1)
  if (!row) throw new Error('Appointment not found')
  if (TERMINAL_APPOINTMENT_STATUSES.has(row.status)) {
    throw new Error(`This appointment is already ${row.status} and can't be changed.`)
  }
  return row.status
}

export async function confirmAppointment(
  organizationId: string,
  appointmentId: string,
  via: 'sms' | 'email' | 'manual' | 'auto_sms_keyword' | 'portal' = 'manual',
) {
  // `no_show` isn't a terminal state (a no-showed patient can rebook via
  // reschedule), but you can't CONFIRM a missed visit back to active — that
  // would corrupt no-show metrics and re-arm reminders for a passed visit.
  const status = await assertAppointmentMutable(organizationId, appointmentId)
  if (status === 'no_show') {
    throw new Error("This visit was marked a no-show — reschedule it instead of confirming.")
  }
  await setAppointmentState(organizationId, appointmentId, {
    status: 'confirmed',
    confirmedAt: new Date(),
    confirmedVia: via,
  })
}

/**
 * Load the patient + clinic context a cancel/no-show needs for the staff
 * notification and (cancel only) the patient confirmation email. Returns null
 * if the appointment vanished. Kept private + best-effort-callable.
 */
async function loadAppointmentNotifyContext(organizationId: string, appointmentId: string) {
  const [appt] = await db
    .select({
      patientId: schema.appointment.patientId,
      type: schema.appointment.type,
      startTime: schema.appointment.startTime,
      endTime: schema.appointment.endTime,
      providerId: schema.appointment.providerId,
    })
    .from(schema.appointment)
    .where(and(eq(schema.appointment.organizationId, organizationId), eq(schema.appointment.id, appointmentId)))
    .limit(1)
  if (!appt) return null
  const [p] = await db
    .select({ firstName: schema.patient.firstName, lastName: schema.patient.lastName, email: schema.patient.email })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, appt.patientId)))
    .limit(1)
  return {
    patientId: appt.patientId,
    type: appt.type,
    startTime: appt.startTime as Date,
    endTime: (appt.endTime as Date | null) ?? null,
    providerId: appt.providerId ?? null,
    patientName: p ? `${p.firstName} ${p.lastName}`.trim() : 'A patient',
    patientEmail: p?.email ?? null,
  }
}

/**
 * Action label for a patient-bound staff notification email — e.g.
 * "View Mia’s record →". Points the front desk straight at the person so they
 * can follow up in one tap. Falls back to a generic label when we don't have a
 * usable first name (the loader's "A patient" fallback).
 */
function patientRecordLinkLabel(patientName: string): string {
  const first = patientName && patientName !== 'A patient' ? patientName.split(' ')[0] : ''
  return first ? `View ${first}’s record →` : 'View patient record →'
}

export async function cancelAppointment(organizationId: string, appointmentId: string) {
  await assertAppointmentMutable(organizationId, appointmentId)
  // Capture patient/clinic context BEFORE the state write — the row is still
  // mutable here, and we want the cancelled visit's details for the email + ping.
  const notifyCtx = await loadAppointmentNotifyContext(organizationId, appointmentId).catch(() => null)
  await setAppointmentState(organizationId, appointmentId, {
    status: 'cancelled',
    cancelledAt: new Date(),
  })
  // Two-way PMS: cancel it in the PMS too, so the old slot stops reminding.
  await queueAppointmentStatusWriteBack(organizationId, appointmentId, 'cancelled')

  // Fast-pass: the freed slot goes to the waitlist (fire-and-forget — the
  // cancellation never waits on offer emails).
  if (notifyCtx) {
    import('@/lib/services/appointment-waitlist')
      .then(({ offerFreedSlot }) =>
        offerFreedSlot(organizationId, {
          start: notifyCtx.startTime,
          end: notifyCtx.endTime,
          providerId: notifyCtx.providerId,
          visitType: notifyCtx.type,
          freedByAppointmentId: appointmentId,
          excludePatientId: notifyCtx.patientId,
        }),
      )
      .catch((err) => console.warn('[appointments.cancelAppointment] waitlist offer failed', err))
  }

  // Best-effort comms (never block the cancel). The portal self-cancel path
  // flows through here too, so this covers patient-initiated cancellations.
  if (notifyCtx) {
    try {
      const dateLabel = notifyCtx.startTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const { notifyOrgMembers } = await import('./notifications')
      await notifyOrgMembers(
        organizationId,
        {
          bucket: 'comments',
          type: 'appointment_cancelled',
          title: `Visit cancelled — ${notifyCtx.patientName}`,
          body: `Their ${notifyCtx.type.replace(/_/g, ' ')} on ${dateLabel} was cancelled.`,
          linkPath: `/patients/${notifyCtx.patientId}`,
          linkLabel: patientRecordLinkLabel(notifyCtx.patientName),
          meta: { appointmentId, patientId: notifyCtx.patientId },
        },
        { roles: ['owner', 'admin'] },
      )
    } catch (err) {
      console.warn('[appointments.cancelAppointment] notification failed', err)
    }
    // Patient confirmation — only when we have an email. NOT on no-show.
    if (notifyCtx.patientEmail) {
      await sendCancellationEmailToPatient(organizationId, {
        to: notifyCtx.patientEmail,
        patientName: notifyCtx.patientName,
        appointmentType: notifyCtx.type,
        startTime: notifyCtx.startTime,
      }).catch((err) => {
        console.warn('[appointments.cancelAppointment] confirmation email failed', err)
      })
    }
  }
}

/** Compose + send the patient-facing cancellation confirmation from the clinic
 *  identity, with a rebook link when the clinic's plan supports online booking.
 *  Best-effort — callers wrap in catch. */
async function sendCancellationEmailToPatient(
  organizationId: string,
  opts: { to: string; patientName: string; appointmentType: string; startTime: Date },
): Promise<void> {
  const [profile] = await db
    .select({
      phone: schema.clinicProfile.phone,
      planTier: schema.clinicProfile.planTier,
      websiteDomain: schema.clinicProfile.websiteDomain,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const [org] = await db
    .select({ slug: schema.organization.slug })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1)

  // Online booking is pro/premium only (basic routes Book to the contact form),
  // so only offer a /book link when the plan supports it.
  let rebookUrl: string | null = null
  const tier = profile?.planTier ?? 'basic'
  if (org && (tier === 'pro' || tier === 'premium')) {
    const { publicSiteUrl } = await import('@/lib/services/clinic-site')
    const base = publicSiteUrl({
      slug: org.slug,
      profile: { websiteDomain: profile?.websiteDomain ?? null } as never,
    })
    rebookUrl = `${base}/book`
  }

  const { getClinicSenderIdentity } = await import('@/lib/services/clinic-sender')
  const { sendCancellationConfirmation } = await import('@/lib/email')
  const { formatClinicDateTime } = await import('@/lib/format-datetime')
  const { renderAutomatedEmail } = await import('@/lib/services/email-automations')
  const sender = await getClinicSenderIdentity(organizationId)
  // Editable copy (Settings → Automations → Emails). Skip the send when the
  // clinic has turned the cancellation email off.
  const rendered = await renderAutomatedEmail(organizationId, 'cancellation', {
    firstName: opts.patientName.split(' ')[0],
    patientName: opts.patientName,
    clinicName: sender.name,
    clinicPhone: profile?.phone ?? '',
    appointmentType: opts.appointmentType.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
    appointmentTime: formatClinicDateTime(opts.startTime, sender.timeZone),
  })
  if (!rendered.enabled) return
  await sendCancellationConfirmation(
    opts.to,
    {
      patientName: opts.patientName,
      clinicName: sender.name,
      clinicPhone: profile?.phone ?? null,
      startTime: opts.startTime,
      appointmentType: opts.appointmentType,
      rebookUrl,
      timeZone: sender.timeZone,
    },
    sender,
    rendered.override,
  )
}

export async function markNoShow(organizationId: string, appointmentId: string) {
  await assertAppointmentMutable(organizationId, appointmentId)
  const notifyCtx = await loadAppointmentNotifyContext(organizationId, appointmentId).catch(() => null)
  await setAppointmentState(organizationId, appointmentId, {
    status: 'no_show',
    noShowedAt: new Date(),
  })
  await queueAppointmentStatusWriteBack(organizationId, appointmentId, 'no_show')

  // Auto-create a "rebook" follow-up so the no-show doesn't quietly vanish —
  // best-effort, idempotent per appointment, never blocks the status change.
  if (notifyCtx) {
    try {
      const { autoCreateRebookFollowup } = await import('./patient-followups')
      await autoCreateRebookFollowup(organizationId, notifyCtx.patientId, notifyCtx.patientName, appointmentId)
    } catch (err) {
      console.warn('[appointments.markNoShow] follow-up create failed', err)
    }
  }

  // Staff ping only — deliberately NO patient email on a no-show.
  if (notifyCtx) {
    try {
      const dateLabel = notifyCtx.startTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const { notifyOrgMembers } = await import('./notifications')
      await notifyOrgMembers(
        organizationId,
        {
          bucket: 'comments',
          type: 'appointment_no_show',
          title: `No-show — ${notifyCtx.patientName}`,
          body: `Their ${notifyCtx.type.replace(/_/g, ' ')} on ${dateLabel} was marked a no-show.`,
          linkPath: `/patients/${notifyCtx.patientId}`,
          linkLabel: patientRecordLinkLabel(notifyCtx.patientName),
          meta: { appointmentId, patientId: notifyCtx.patientId },
        },
        { roles: ['owner', 'admin'] },
      )
    } catch (err) {
      console.warn('[appointments.markNoShow] notification failed', err)
    }
  }
}

/** Result of completing a visit. `reviewSent` is true when the completion
 *  immediately fired a review request (auto-send on + delay 0 + it actually
 *  sent) so the UI can toast "review request sent". */
export interface MarkCompletedResult {
  reviewSent: boolean
}

export async function markCompleted(
  organizationId: string,
  appointmentId: string,
): Promise<MarkCompletedResult> {
  await assertAppointmentMutable(organizationId, appointmentId)
  await setAppointmentState(organizationId, appointmentId, {
    status: 'completed',
    completedAt: new Date(),
  })
  // Completing a visit is the most significant activity event — bump the
  // patient's lastActivityAt so recency sorting + the recall heuristic reflect
  // it (booking already does this; completion didn't).
  const [appt] = await db
    .select({ patientId: schema.appointment.patientId })
    .from(schema.appointment)
    .where(and(eq(schema.appointment.organizationId, organizationId), eq(schema.appointment.id, appointmentId)))
    .limit(1)
  if (appt?.patientId) {
    await db
      .update(schema.patient)
      .set({ lastActivityAt: new Date() })
      .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, appt.patientId)))
  }

  // The core of the reviews loop: a completed visit auto-sends a review request
  // (Google-first). Best-effort + non-blocking — a send failure must never fail
  // the completion. Only fires when the clinic left auto-send on AND set a 0-hour
  // delay (immediate); a positive delay defers to the hourly cron. The dedupe in
  // fireReviewRequestForAppointment keeps this and the cron from double-sending.
  let reviewSent = false
  if (appt?.patientId) {
    try {
      const { getReviewConfig, shouldSendImmediately, fireReviewRequestForAppointment } = await import('./reviews')
      const config = await getReviewConfig(organizationId)
      if (shouldSendImmediately(config)) {
        const r = await fireReviewRequestForAppointment(organizationId, appointmentId, appt.patientId)
        reviewSent = r.outcome === 'sent'
      }
    } catch (err) {
      console.warn('[appointments.markCompleted] review auto-send failed', err)
    }
  }
  return { reviewSent }
}

export interface RescheduleInput {
  organizationId: string
  appointmentId: string
  newStartTime: Date
  newEndTime: Date | null
}

export async function rescheduleAppointment(input: RescheduleInput) {
  // Cancel-original + insert-new must be atomic: a partial apply either
  // resurrects nothing (original cancelled, no replacement) or leaves a phantom
  // duplicate. We run both writes in a single `db.transaction()` — restored now
  // that the DB is node-postgres (which supports transactions; the prior "Neon
  // HTTP driver has no transaction support" note was stale). The select +
  // terminal-state guard run outside the tx (read-only); the two writes run
  // inside and roll back together on any failure.
  const [original] = await db
    .select()
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, input.organizationId),
        eq(schema.appointment.id, input.appointmentId),
      ),
    )
    .limit(1)
  if (!original) throw new Error('Appointment not found')
  if (TERMINAL_APPOINTMENT_STATUSES.has(original.status)) {
    throw new Error(`This appointment is already ${original.status} and can't be rescheduled.`)
  }

  // Preserve the original visit's duration when the caller doesn't supply a new
  // end time (the reschedule drawer only sends a new start). Without this every
  // reschedule dropped endTime to null, which (a) showed "duration unspecified"
  // on the agenda and (b) made the slot picker treat the visit as a 30-min
  // block — so a rescheduled 60-min appointment freed up the adjacent slot.
  let resolvedEnd = input.newEndTime
  if (!resolvedEnd) {
    const DEFAULT_DURATION_MS = 30 * 60 * 1000
    const durationMs =
      original.endTime && original.startTime
        ? new Date(original.endTime).getTime() - new Date(original.startTime).getTime()
        : DEFAULT_DURATION_MS
    resolvedEnd = new Date(
      input.newStartTime.getTime() + (durationMs > 0 ? durationMs : DEFAULT_DURATION_MS),
    )
  }

  const newId = newAppointmentId()
  await db.transaction(async (tx) => {
    await tx.insert(schema.appointment).values({
      id: newId,
      organizationId: input.organizationId,
      patientId: original.patientId,
      locationId: original.locationId,
      providerId: original.providerId,
      title: original.title,
      startTime: input.newStartTime,
      endTime: resolvedEnd,
      type: original.type,
      status: 'scheduled',
      notes: original.notes,
      // Carry the original booking source forward — a rescheduled widget/portal
      // appointment must keep its attribution, not silently become 'manual'
      // (which dropped it from the source filter + analytics + PMS context).
      source: original.source ?? 'manual',
      rescheduledFromAppointmentId: input.appointmentId,
    })

    await tx
      .update(schema.appointment)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.appointment.organizationId, input.organizationId),
          eq(schema.appointment.id, input.appointmentId),
        ),
      )
  })

  // Two-way PMS: cancel the original in the PMS (so the old time stops
  // reminding), then push the new slot as a fresh booking. Outside the tx —
  // these enqueue best-effort write-ops and must not roll back the reschedule.
  await queueAppointmentStatusWriteBack(input.organizationId, input.appointmentId, 'cancelled')
  await queueAppointmentWriteBack(input.organizationId, newId)
  return newId
}

// ----- Reminder log -----------------------------------------------------

export interface LogReminderInput {
  organizationId: string
  appointmentId: string
  channel: AppointmentChannel
  template?: string
  sentByUserId: string | null
}

export async function logReminderSent(input: LogReminderInput): Promise<string> {
  const id = newReminderLogId()
  await db.insert(schema.appointmentReminderLog).values({
    id,
    organizationId: input.organizationId,
    appointmentId: input.appointmentId,
    channel: input.channel,
    template: input.template ?? null,
    sentByUserId: input.sentByUserId,
  })
  return id
}

// ----- New booking (internal — used by the "Book appointment" drawer) ----

export interface CreateInternalAppointmentInput {
  organizationId: string
  patientId: string
  startTime: Date
  endTime?: Date | null
  /** Visit length in minutes. Used to derive endTime when an explicit endTime
   *  isn't supplied (front-desk drawer picks a visit type → its duration). */
  durationMinutes?: number | null
  type?: string
  providerId?: string | null
  notes?: string | null
  source?: AppointmentSource
}

export async function createInternalAppointment(input: CreateInternalAppointmentInput): Promise<string> {
  // Verify patient belongs to this org.
  const [p] = await db
    .select({ id: schema.patient.id, firstName: schema.patient.firstName, lastName: schema.patient.lastName })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, input.organizationId), eq(schema.patient.id, input.patientId)))
    .limit(1)
  if (!p) throw new Error('Patient not found in this clinic')

  const id = newAppointmentId()
  // endTime precedence: explicit endTime → start + duration → start + 30 min.
  const durationMs =
    input.durationMinutes && Number.isFinite(input.durationMinutes) && input.durationMinutes > 0
      ? Math.round(input.durationMinutes) * 60 * 1000
      : 30 * 60 * 1000
  const endTime = input.endTime ?? new Date(input.startTime.getTime() + durationMs)
  const type = input.type ?? 'cleaning'
  await db.insert(schema.appointment).values({
    id,
    organizationId: input.organizationId,
    patientId: input.patientId,
    providerId: input.providerId ?? null,
    title: `${type.replace(/_/g, ' ')} — ${p.firstName} ${p.lastName}`,
    startTime: input.startTime,
    endTime,
    type,
    status: 'scheduled',
    notes: input.notes ?? null,
    source: input.source ?? 'manual',
  })
  // Bump patient activity so list page sees them as fresh.
  await db
    .update(schema.patient)
    .set({ lastActivityAt: new Date() })
    .where(
      and(
        eq(schema.patient.organizationId, input.organizationId),
        eq(schema.patient.id, input.patientId),
      ),
    )
  // Two-way PMS: queue this booking to be written into the clinic's PMS on the
  // next sync (best-effort, never blocks booking).
  await queueAppointmentWriteBack(input.organizationId, id)
  return id
}

// ----- Filter meta (providers + counts) ---------------------------------

export interface AppointmentFilterMeta {
  providers: Array<{ id: string; displayName: string; role: string }>
  /** Booking-channel values that actually exist for this org. */
  sources: string[]
}

export async function getAppointmentFilterMeta(organizationId: string): Promise<AppointmentFilterMeta> {
  const [providers, sourceRows] = await Promise.all([
    db
      .select({
        id: schema.clinicProvider.id,
        displayName: schema.clinicProvider.displayName,
        role: schema.clinicProvider.role,
      })
      .from(schema.clinicProvider)
      .where(
        and(
          eq(schema.clinicProvider.organizationId, organizationId),
          eq(schema.clinicProvider.isActive, 1),
        ),
      )
      .orderBy(asc(schema.clinicProvider.displayName)),
    // Distinct booking sources present on this org's appointments. We
    // exclude nulls so the dropdown shows only meaningful options.
    db
      .selectDistinct({ source: schema.appointment.source })
      .from(schema.appointment)
      .where(eq(schema.appointment.organizationId, organizationId)),
  ])
  const sources = sourceRows
    .map((r) => r.source)
    .filter((s): s is string => !!s)
    .sort()
  return { providers, sources }
}

// Quiet unused-import lint for the seldom-hit `isNull` import.
export const _internal = { isNull }

// ── CSV export (the agenda's "call sheet") ──────────────────────────────────

const APPT_EXPORT_HEADERS = ['Date', 'Time', 'Patient', 'Phone', 'Email', 'Type', 'Status', 'Provider'] as const

/**
 * Pure: render appointment rows + a patientId→contact map into a CSV, with the
 * date + time formatted in the clinic's timezone (so a printed call sheet reads
 * in local wall-clock, not UTC). Exported for tests.
 */
export function appointmentsToCsv(
  rows: Array<Pick<AppointmentRow, 'patientId' | 'patientName' | 'startTime' | 'type' | 'status' | 'providerName'>>,
  contactsById: Map<string, { phone: string | null; email: string | null }>,
  timeZone: string,
): string {
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
  const body = rows.map((r) => {
    const c = contactsById.get(r.patientId)
    return [
      dateFmt.format(r.startTime),
      timeFmt.format(r.startTime),
      r.patientName,
      c?.phone ?? '',
      c?.email ?? '',
      r.type.replace(/_/g, ' '),
      r.status,
      r.providerName ?? '',
    ]
  })
  return toCsv([...APPT_EXPORT_HEADERS], body) + '\r\n'
}

/**
 * The current agenda view as a CSV — same window/attention/provider/source/
 * search filters as the on-screen list. Adds patient phone + email (a usable
 * call sheet) and renders times in the clinic timezone. Reuses listAppointments
 * so the row set can't drift from the table.
 */
export async function exportAppointmentsCsv(
  organizationId: string,
  filters: AppointmentListFilters = {},
): Promise<string> {
  const rows = await listAppointments(organizationId, filters)
  const timeZone = await getClinicTimeZone(organizationId)

  const ids = Array.from(new Set(rows.map((r) => r.patientId)))
  const contacts = ids.length
    ? await db
        .select({ id: schema.patient.id, phone: schema.patient.phone, email: schema.patient.email })
        .from(schema.patient)
        .where(and(eq(schema.patient.organizationId, organizationId), inArray(schema.patient.id, ids)))
    : []
  const byId = new Map(contacts.map((c) => [c.id, { phone: c.phone, email: c.email }]))

  return appointmentsToCsv(rows, byId, timeZone)
}
