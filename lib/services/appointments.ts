import 'server-only'
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { randomBytes } from 'crypto'
import { queueAppointmentWriteBack, queueAppointmentStatusWriteBack } from '@/lib/services/pms'

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

function startOfDay(d: Date): Date { const r = new Date(d); r.setHours(0, 0, 0, 0); return r }
function startOfWeek(d: Date): Date {
  const r = startOfDay(d)
  const dow = r.getDay() // 0=Sun
  r.setDate(r.getDate() - dow)
  return r
}

function isBirthdayThisWeek(dob: string | null, today: Date): boolean {
  if (!dob) return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  if (!m) return false
  const month = parseInt(m[2], 10) - 1
  const day = parseInt(m[3], 10)
  const candidate = new Date(today.getFullYear(), month, day)
  if (candidate < startOfDay(today)) candidate.setFullYear(today.getFullYear() + 1)
  const sixOut = new Date(today)
  sixOut.setDate(sixOut.getDate() + 6)
  return candidate >= startOfDay(today) && candidate <= sixOut
}

// 9 months in ms — matches the Patients module lapsed threshold.
const LAPSED_THRESHOLD_MS = 9 * 30 * 24 * 60 * 60 * 1000
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

function resolveWindow(window: AppointmentListFilters['window'], now: Date): { from: Date; to: Date; isPast: boolean } {
  const today = startOfDay(now)
  switch (window) {
    case 'today': {
      const end = new Date(today); end.setDate(end.getDate() + 1)
      return { from: today, to: end, isPast: false }
    }
    case 'tomorrow': {
      const start = new Date(today); start.setDate(start.getDate() + 1)
      const end = new Date(start); end.setDate(end.getDate() + 1)
      return { from: start, to: end, isPast: false }
    }
    case 'this_week': {
      const start = startOfWeek(now)
      const end = new Date(start); end.setDate(end.getDate() + 7)
      return { from: start, to: end, isPast: false }
    }
    case 'next_14d': {
      const end = new Date(today); end.setDate(end.getDate() + 14)
      return { from: today, to: end, isPast: false }
    }
    case 'past_30d': {
      const start = new Date(today); start.setDate(start.getDate() - 30)
      return { from: start, to: today, isPast: true }
    }
    case 'all_upcoming':
    default: {
      // 90 days forward as a hard ceiling so we don't try to render
      // year-long futures on the agenda.
      const end = new Date(today); end.setDate(end.getDate() + 90)
      return { from: today, to: end, isPast: false }
    }
  }
}

// ----- List page --------------------------------------------------------

export async function listAppointments(
  organizationId: string,
  filters: AppointmentListFilters = {},
): Promise<AppointmentRow[]> {
  const now = new Date()
  const win = resolveWindow(filters.window, now)
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const lapsedCutoff = new Date(now.getTime() - LAPSED_THRESHOLD_MS)

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
  const patientEmails = Array.from(
    new Set(rows.map((r) => r.patientEmail).filter((e): e is string => !!e)),
  )

  // Fan-out queries for derived signal columns. All parallel.
  const [intakeRows, lastReminderRows, balanceRows, priorAppts, futureAppts] = await Promise.all([
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
    // Outstanding balance per patient (prefer FK; fall back to email).
    patientEmails.length === 0
      ? []
      : db
          .select({
            patientId: schema.customers.patientId,
            email: schema.customers.email,
            totalCents: schema.invoices.totalCents,
          })
          .from(schema.invoices)
          .innerJoin(schema.customers, eq(schema.invoices.customerId, schema.customers.id))
          .where(
            and(
              eq(schema.invoices.organizationId, organizationId),
              inArray(schema.invoices.status, ['pending', 'overdue']),
              or(
                inArray(schema.customers.patientId, patientIds),
                inArray(schema.customers.email, patientEmails),
              )!,
            ),
          ),
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
  ])

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

  // Balance per patient (sum across invoices linked by FK or email).
  const balanceByPatient = new Map<string, number>()
  const emailLowerToPatientId = new Map<string, string>()
  for (const r of rows) {
    if (r.patientEmail) emailLowerToPatientId.set(r.patientEmail.toLowerCase(), r.patientId)
  }
  for (const r of balanceRows) {
    const pid = r.patientId ?? (r.email ? emailLowerToPatientId.get(r.email.toLowerCase()) ?? null : null)
    if (!pid) continue
    balanceByPatient.set(pid, (balanceByPatient.get(pid) ?? 0) + Number(r.totalCents ?? 0))
  }

  // Latest prior appointment per patient (the array is already sorted desc).
  const latestPriorByPatient = new Map<string, Date>()
  for (const r of priorAppts) {
    if (!latestPriorByPatient.has(r.patientId)) latestPriorByPatient.set(r.patientId, r.startTime)
  }

  // Patients with any future booking — used to suppress the rebooking flag.
  const hasFutureByPatient = new Set<string>()
  for (const r of futureAppts) hasFutureByPatient.add(r.patientId)

  const result: AppointmentRow[] = rows.map((r) => {
    const status = r.status as AppointmentStatus
    const lastVisit = latestPriorByPatient.get(r.patientId) ?? null
    const newPatient = !lastVisit && r.startTime > now
    const lapsed = !!lastVisit && lastVisit < lapsedCutoff
    const lastReminder = lastReminderByAppt.get(r.id) ?? null
    const hasIntake = intakeApptSet.has(r.id) || intakeAnyPatient.has(r.patientId)
    const isFuture = r.startTime > now
    const balance = balanceByPatient.get(r.patientId) ?? 0
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

export function groupByDay(rows: AppointmentRow[], now: Date = new Date()): AppointmentDayGroup[] {
  const todayKey = startOfDay(now).toDateString()
  const tomorrowKey = (() => { const d = startOfDay(now); d.setDate(d.getDate() + 1); return d.toDateString() })()
  const byKey = new Map<string, AppointmentRow[]>()
  for (const r of rows) {
    const k = startOfDay(r.startTime).toDateString()
    const arr = byKey.get(k) ?? []
    arr.push(r)
    byKey.set(k, arr)
  }
  const out: AppointmentDayGroup[] = []
  for (const [k, group] of Array.from(byKey.entries())) {
    const date = new Date(k)
    const label =
      k === todayKey
        ? 'Today · ' + date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
        : k === tomorrowKey
          ? 'Tomorrow · ' + date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
          : date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
    const totals = { booked: group.length, confirmed: 0, unconfirmed: 0 }
    for (const r of group) {
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
  const [reminderRows, intakeRow, balanceRows, ltvRows, lastVisitRow, bookingCountRow, futureApptRow] = await Promise.all([
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
    db
      .select({ totalCents: schema.invoices.totalCents })
      .from(schema.invoices)
      .innerJoin(schema.customers, eq(schema.invoices.customerId, schema.customers.id))
      .where(
        and(
          eq(schema.invoices.organizationId, organizationId),
          inArray(schema.invoices.status, ['pending', 'overdue']),
          base.patientEmail
            ? or(
                eq(schema.customers.patientId, base.patientId),
                eq(schema.customers.email, base.patientEmail),
              )!
            : eq(schema.customers.patientId, base.patientId),
        ),
      ),
    db
      .select({ totalCents: schema.invoices.totalCents })
      .from(schema.invoices)
      .innerJoin(schema.customers, eq(schema.invoices.customerId, schema.customers.id))
      .where(
        and(
          eq(schema.invoices.organizationId, organizationId),
          eq(schema.invoices.status, 'paid'),
          base.patientEmail
            ? or(
                eq(schema.customers.patientId, base.patientId),
                eq(schema.customers.email, base.patientEmail),
              )!
            : eq(schema.customers.patientId, base.patientId),
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
  ])

  const outstanding = balanceRows.reduce<number>((acc, r) => acc + Number(r.totalCents ?? 0), 0)
  const ltv = ltvRows.reduce<number>((acc, r) => acc + Number(r.totalCents ?? 0), 0)
  const status = base.status as AppointmentStatus
  const duration =
    base.endTime ? Math.max(15, Math.round((base.endTime.getTime() - base.startTime.getTime()) / 60000)) : null
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const lastVisit = lastVisitRow[0]?.startTime ?? null
  const lapsed = !!lastVisit && lastVisit < new Date(now.getTime() - LAPSED_THRESHOLD_MS)
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

async function assertAppointmentMutable(organizationId: string, appointmentId: string): Promise<void> {
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
}

export async function confirmAppointment(
  organizationId: string,
  appointmentId: string,
  via: 'sms' | 'email' | 'manual' | 'auto_sms_keyword' | 'portal' = 'manual',
) {
  await assertAppointmentMutable(organizationId, appointmentId)
  await setAppointmentState(organizationId, appointmentId, {
    status: 'confirmed',
    confirmedAt: new Date(),
    confirmedVia: via,
  })
}

export async function cancelAppointment(organizationId: string, appointmentId: string) {
  await assertAppointmentMutable(organizationId, appointmentId)
  await setAppointmentState(organizationId, appointmentId, {
    status: 'cancelled',
    cancelledAt: new Date(),
  })
  // Two-way PMS: cancel it in the PMS too, so the old slot stops reminding.
  await queueAppointmentStatusWriteBack(organizationId, appointmentId, 'cancelled')
}

export async function markNoShow(organizationId: string, appointmentId: string) {
  await assertAppointmentMutable(organizationId, appointmentId)
  await setAppointmentState(organizationId, appointmentId, {
    status: 'no_show',
    noShowedAt: new Date(),
  })
  await queueAppointmentStatusWriteBack(organizationId, appointmentId, 'no_show')
}

export async function markCompleted(organizationId: string, appointmentId: string) {
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
}

export interface RescheduleInput {
  organizationId: string
  appointmentId: string
  newStartTime: Date
  newEndTime: Date | null
}

export async function rescheduleAppointment(input: RescheduleInput) {
  // Previously wrapped in `db.transaction()` to make cancel-original +
  // insert-new atomic, but the Neon HTTP driver throws "No transactions
  // support in neon-http driver" at runtime. Order matters here: insert
  // the new appointment FIRST, then cancel the original. Failure modes:
  //   - insert fails → original unchanged, user retries
  //   - insert succeeds + cancel fails → temporary duplicate (front desk
  //     spots it on the agenda + can cancel the stale row by hand), much
  //     less bad than the old failure mode (original cancelled with no
  //     replacement)
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
  await db.insert(schema.appointment).values({
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

  await db
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

  // Two-way PMS: cancel the original in the PMS (so the old time stops
  // reminding), then push the new slot as a fresh booking.
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
