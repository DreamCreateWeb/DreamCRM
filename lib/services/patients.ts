import 'server-only'
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { randomBytes } from 'crypto'
import { derivePatientRecallStatus } from '@/lib/services/recall-status'
import { normalizeEmail, normalizePhone } from '@/lib/contact-normalize'

/**
 * Patients service — the CRM-side relationship view.
 *
 * Per the research doc, a patient in DreamCRM is a *relationship record*,
 * not a clinical chart. We surface everything the front desk + marketing
 * side cares about (last visit, next visit, recall status, balance, source,
 * comms history) and surface NONE of the clinical chart (charts, procedure
 * codes, claims, prescriptions — those live in the PMS).
 */

// ----- Public types -----------------------------------------------------

export type PatientLifecycle = 'lead' | 'new' | 'active' | 'at_risk' | 'lapsed' | 'archived'
export type PatientSource = 'website' | 'booking' | 'referral' | 'walk_in' | 'manual' | 'lead_form' | 'invite'

export interface PatientRowFlags {
  newPatient: boolean
  birthdayThisWeek: boolean
  hasOutstandingBalance: boolean
  missingIntakeBeforeAppt: boolean
  unconfirmedNext48h: boolean
  lapsed: boolean
  optedOut: boolean
}

export interface PatientListRow {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string | null
  phone: string | null
  dateOfBirth: string | null
  ageYears: number | null
  source: string | null
  lifecycle: PatientLifecycle
  firstSeenAt: Date | null
  lastVisitAt: Date | null
  nextVisitAt: Date | null
  nextVisitType: string | null
  recallStatus: 'due' | 'overdue' | 'scheduled' | 'na'
  outstandingBalanceCents: number
  lifetimeValueCents: number
  lastContactAt: Date | null
  flags: PatientRowFlags
}

export interface PatientListFilters {
  status?: 'all' | 'new' | 'recall_due' | 'inactive' | 'archived'
  hasBalance?: boolean
  missingIntake?: boolean
  birthdayThisMonth?: boolean
  sources?: string[]
  optedOut?: boolean
  search?: string
}

export interface PatientListSort {
  field: 'name' | 'lastVisit' | 'nextVisit' | 'balance' | 'created' | 'lastActivity'
  direction: 'asc' | 'desc'
}

export interface PatientHeader {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string | null
  phone: string | null
  dateOfBirth: string | null
  ageYears: number | null
  addressLine1: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  insuranceProvider: string | null
  insurancePolicyNumber: string | null
  insuranceGroupNumber: string | null
  notes: string | null
  source: string | null
  lifecycle: PatientLifecycle
  firstSeenAt: Date | null
  lastActivityAt: Date | null
  hasPortalAccount: boolean
  /** Family access: the patient whose portal login manages this one. */
  guardianPatientId: string | null
  flags: PatientRowFlags
  // Aggregates pulled in the same call so the header has no extra round-trip.
  outstandingBalanceCents: number
  lifetimeValueCents: number
  lastVisitAt: Date | null
  nextVisitAt: Date | null
  nextVisitType: string | null
  totalBookings: number
}

export interface PatientFilterMeta {
  sources: string[]
}

// ----- Helpers ----------------------------------------------------------

function startOfDay(d: Date): Date { const r = new Date(d); r.setHours(0, 0, 0, 0); return r }
function startOfMonth(d: Date): Date { const r = new Date(d.getFullYear(), d.getMonth(), 1); r.setHours(0, 0, 0, 0); return r }
function endOfMonth(d: Date): Date { const r = new Date(d.getFullYear(), d.getMonth() + 1, 0); r.setHours(23, 59, 59, 999); return r }

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  if (!m) return null
  const birth = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  const today = new Date()
  let years = today.getFullYear() - birth.getFullYear()
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  if (beforeBirthday) years -= 1
  return years
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

function isBirthdayThisMonth(dob: string | null, today: Date): boolean {
  if (!dob) return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  if (!m) return false
  return parseInt(m[2], 10) - 1 === today.getMonth()
}

export function newPatientId(): string {
  return `pat_${randomBytes(10).toString('hex')}`
}

export function newPatientNoteId(): string {
  return `pnote_${randomBytes(10).toString('hex')}`
}

// Lapsed = last visit more than 9 months ago AND no future booking. Used
// both for the 💤 glyph and the `lifecycle = 'lapsed'` denormalization.
const LAPSED_THRESHOLD_MS = 9 * 30 * 24 * 60 * 60 * 1000 // ~9 months

// ----- List page --------------------------------------------------------

export async function listPatients(
  organizationId: string,
  filters: PatientListFilters = {},
  sort: PatientListSort = { field: 'name', direction: 'asc' },
): Promise<PatientListRow[]> {
  const now = new Date()
  const today = startOfDay(now)
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const lapsedCutoff = new Date(now.getTime() - LAPSED_THRESHOLD_MS)
  const monthBirthStart = startOfMonth(now)
  const monthBirthEnd = endOfMonth(now)

  const where = [eq(schema.patient.organizationId, organizationId)]
  if (filters.status !== 'archived') {
    where.push(eq(schema.patient.isActive, 1))
  }
  if (filters.status === 'new') {
    where.push(eq(schema.patient.lifecycle, 'new'))
  } else if (filters.status === 'inactive') {
    where.push(eq(schema.patient.lifecycle, 'lapsed'))
  } else if (filters.status === 'archived') {
    where.push(eq(schema.patient.isActive, 0))
  }
  if (filters.sources && filters.sources.length > 0) {
    where.push(inArray(schema.patient.source, filters.sources))
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
        phoneQ
          ? sql`regexp_replace(coalesce(${schema.patient.phone}, ''), '\\D', '', 'g') like ${phoneQ}`
          : sql`false`,
      )!,
    )
  }

  const patients = await db.select().from(schema.patient).where(and(...where))

  if (patients.length === 0) return []
  const ids = patients.map((p) => p.id)
  const emails = patients.map((p) => p.email).filter((e): e is string => !!e)

  // Pull joined data in parallel.
  const [lastVisits, nextVisits, unconfirmedNear, invoiceRows, ltvRows, intakeRows, lastMessages, recallScheduledNear] =
    await Promise.all([
      // Last completed/confirmed appointment per patient (most recent past startTime).
      db
        .select({
          patientId: schema.appointment.patientId,
          startTime: schema.appointment.startTime,
        })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, organizationId),
            inArray(schema.appointment.patientId, ids),
            lte(schema.appointment.startTime, now),
            ne(schema.appointment.status, 'cancelled'),
            ne(schema.appointment.status, 'no_show'),
          ),
        )
        .orderBy(desc(schema.appointment.startTime)),
      // Next future booking per patient.
      db
        .select({
          patientId: schema.appointment.patientId,
          startTime: schema.appointment.startTime,
          type: schema.appointment.type,
        })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, organizationId),
            inArray(schema.appointment.patientId, ids),
            gte(schema.appointment.startTime, now),
            ne(schema.appointment.status, 'cancelled'),
            ne(schema.appointment.status, 'no_show'),
          ),
        )
        .orderBy(asc(schema.appointment.startTime)),
      // Unconfirmed within 48h.
      db
        .select({ patientId: schema.appointment.patientId })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, organizationId),
            inArray(schema.appointment.patientId, ids),
            eq(schema.appointment.status, 'scheduled'),
            gte(schema.appointment.startTime, now),
            lte(schema.appointment.startTime, in48h),
          ),
        ),
      // Outstanding balances — prefer customers.patientId FK, fall back to email match.
      emails.length === 0
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
                  inArray(schema.customers.patientId, ids),
                  inArray(schema.customers.email, emails),
                )!,
              ),
            ),
      // Lifetime value — sum of paid invoices.
      emails.length === 0
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
                eq(schema.invoices.status, 'paid'),
                or(
                  inArray(schema.customers.patientId, ids),
                  inArray(schema.customers.email, emails),
                )!,
              ),
            ),
      // Intake submissions on file.
      db
        .select({ patientId: schema.formSubmission.patientId })
        .from(schema.formSubmission)
        .where(
          and(
            eq(schema.formSubmission.organizationId, organizationId),
            inArray(schema.formSubmission.patientId, ids),
          ),
        ),
      // Last contact — most-recent message in any conversation the patient
      // user is part of.
      db
        .select({
          userId: schema.conversationMembers.userId,
          createdAt: schema.messages.createdAt,
        })
        .from(schema.messages)
        .innerJoin(
          schema.conversationMembers,
          eq(schema.messages.conversationId, schema.conversationMembers.conversationId),
        )
        .innerJoin(
          schema.patient,
          eq(schema.patient.userId, schema.conversationMembers.userId),
        )
        .where(
          and(
            eq(schema.patient.organizationId, organizationId),
            inArray(schema.patient.id, ids),
          ),
        )
        .orderBy(desc(schema.messages.createdAt)),
      // Next future booking with status='scheduled' (counts as "recall scheduled" if within recall window).
      db
        .select({ patientId: schema.appointment.patientId })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, organizationId),
            inArray(schema.appointment.patientId, ids),
            gte(schema.appointment.startTime, now),
            lte(schema.appointment.startTime, in7d),
          ),
        ),
    ])

  // Reduce arrays to maps so the per-row loop is O(1) each.
  const lastVisitMap = new Map<string, Date>()
  for (const r of lastVisits) {
    if (!lastVisitMap.has(r.patientId)) lastVisitMap.set(r.patientId, r.startTime)
  }
  const nextVisitMap = new Map<string, { startTime: Date; type: string }>()
  for (const r of nextVisits) {
    if (!nextVisitMap.has(r.patientId)) nextVisitMap.set(r.patientId, { startTime: r.startTime, type: r.type })
  }
  const unconfirmedSet = new Set(unconfirmedNear.map((r) => r.patientId))
  const recallSet = new Set(recallScheduledNear.map((r) => r.patientId))
  const intakeSet = new Set<string>()
  for (const r of intakeRows) { if (r.patientId) intakeSet.add(r.patientId) }
  const lastContactMap = new Map<string, Date>()
  for (const r of lastMessages) {
    if (r.userId && !lastContactMap.has(r.userId)) lastContactMap.set(r.userId, r.createdAt)
  }

  const balanceByPatient = new Map<string, number>()
  const ltvByPatient = new Map<string, number>()
  const emailLowerToId = new Map<string, string>()
  for (const p of patients) {
    if (p.email) emailLowerToId.set(p.email.toLowerCase(), p.id)
  }
  for (const r of invoiceRows) {
    const pid = r.patientId ?? (r.email ? emailLowerToId.get(r.email.toLowerCase()) ?? null : null)
    if (!pid) continue
    balanceByPatient.set(pid, (balanceByPatient.get(pid) ?? 0) + Number(r.totalCents ?? 0))
  }
  for (const r of ltvRows) {
    const pid = r.patientId ?? (r.email ? emailLowerToId.get(r.email.toLowerCase()) ?? null : null)
    if (!pid) continue
    ltvByPatient.set(pid, (ltvByPatient.get(pid) ?? 0) + Number(r.totalCents ?? 0))
  }

  // Compose rows.
  const rows: PatientListRow[] = patients.map((p) => {
    const lastVisitAt = lastVisitMap.get(p.id) ?? null
    const next = nextVisitMap.get(p.id) ?? null
    const balance = balanceByPatient.get(p.id) ?? 0
    const ltv = ltvByPatient.get(p.id) ?? 0
    const newPatient = p.lifecycle === 'new' || !lastVisitAt
    const lapsed = !!lastVisitAt && lastVisitAt < lapsedCutoff && !next
    const missingIntakeBeforeAppt = !!next && next.startTime <= in7d && !intakeSet.has(p.id)
    // Prefer the PMS recall date when present (Integrations); otherwise fall
    // back to the appointment-derived heuristic so unconnected clinics behave
    // exactly as before.
    const recallStatus = derivePatientRecallStatus({
      pmsRecallDueAt: p.pmsRecallDueAt,
      hasUpcomingAppt: recallSet.has(p.id),
      hasAnyFutureAppt: !!next,
      lastVisitAt,
      now,
    })
    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      fullName: `${p.firstName} ${p.lastName}`,
      email: p.email,
      phone: p.phone,
      dateOfBirth: p.dateOfBirth,
      ageYears: ageFromDob(p.dateOfBirth),
      source: p.source,
      lifecycle: (p.lifecycle ?? 'active') as PatientLifecycle,
      firstSeenAt: p.firstSeenAt,
      lastVisitAt,
      nextVisitAt: next?.startTime ?? null,
      nextVisitType: next?.type ?? null,
      recallStatus,
      outstandingBalanceCents: balance,
      lifetimeValueCents: ltv,
      lastContactAt: p.userId ? lastContactMap.get(p.userId) ?? null : null,
      flags: {
        newPatient,
        birthdayThisWeek: isBirthdayThisWeek(p.dateOfBirth, now),
        hasOutstandingBalance: balance > 0,
        missingIntakeBeforeAppt,
        unconfirmedNext48h: unconfirmedSet.has(p.id),
        lapsed,
        // Patients are opted-OUT for marketing email when marketingEmailOptIn
        // is 0 (one-click unsubscribe from any campaign footer, hard bounce,
        // or explicit toggle on the patient detail). The 🔕 glyph cluster
        // surfaces this on the list.
        optedOut: p.marketingEmailOptIn === 0,
      },
    }
  })

  // Apply post-query filters that need derived fields.
  let filtered = rows
  if (filters.hasBalance) filtered = filtered.filter((r) => r.outstandingBalanceCents > 0)
  if (filters.missingIntake) filtered = filtered.filter((r) => r.flags.missingIntakeBeforeAppt)
  if (filters.birthdayThisMonth) {
    filtered = filtered.filter((r) => isBirthdayThisMonth(r.dateOfBirth, now))
  }
  if (filters.status === 'recall_due') {
    filtered = filtered.filter((r) => r.recallStatus === 'due' || r.recallStatus === 'overdue')
  }

  // Sort.
  const dir = sort.direction === 'asc' ? 1 : -1
  filtered.sort((a, b) => {
    switch (sort.field) {
      case 'name':
        return dir * (a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
      case 'lastVisit':
        return dir * (
          (a.lastVisitAt?.getTime() ?? 0) - (b.lastVisitAt?.getTime() ?? 0)
        )
      case 'nextVisit':
        return dir * (
          (a.nextVisitAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (b.nextVisitAt?.getTime() ?? Number.MAX_SAFE_INTEGER)
        )
      case 'balance':
        return dir * (a.outstandingBalanceCents - b.outstandingBalanceCents)
      case 'lastActivity':
        return dir * (
          (a.lastContactAt?.getTime() ?? 0) - (b.lastContactAt?.getTime() ?? 0)
        )
      case 'created':
      default:
        return dir * (
          (a.firstSeenAt?.getTime() ?? 0) - (b.firstSeenAt?.getTime() ?? 0)
        )
    }
  })

  return filtered
}

export async function getPatientListMeta(organizationId: string): Promise<PatientFilterMeta> {
  const sources = await db
    .selectDistinct({ source: schema.patient.source })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), isNotNull(schema.patient.source)))
  return {
    sources: sources.map((r) => r.source!).filter(Boolean).sort(),
  }
}

// ----- Detail header ----------------------------------------------------

export async function getPatientHeader(
  organizationId: string,
  patientId: string,
): Promise<PatientHeader | null> {
  const [p] = await db
    .select()
    .from(schema.patient)
    .where(
      and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)),
    )
    .limit(1)
  if (!p) return null

  const now = new Date()
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const lapsedCutoff = new Date(now.getTime() - LAPSED_THRESHOLD_MS)

  const [lastVisit, nextVisit, bookingCount, unpaidRows, paidRows, intakeRows, unconfirmedRow] =
    await Promise.all([
      db
        .select({ startTime: schema.appointment.startTime })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, organizationId),
            eq(schema.appointment.patientId, patientId),
            lte(schema.appointment.startTime, now),
            ne(schema.appointment.status, 'cancelled'),
            ne(schema.appointment.status, 'no_show'),
          ),
        )
        .orderBy(desc(schema.appointment.startTime))
        .limit(1),
      db
        .select({ startTime: schema.appointment.startTime, type: schema.appointment.type })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, organizationId),
            eq(schema.appointment.patientId, patientId),
            gte(schema.appointment.startTime, now),
            ne(schema.appointment.status, 'cancelled'),
            ne(schema.appointment.status, 'no_show'),
          ),
        )
        .orderBy(asc(schema.appointment.startTime))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, organizationId),
            eq(schema.appointment.patientId, patientId),
          ),
        ),
      db
        .select({
          totalCents: schema.invoices.totalCents,
        })
        .from(schema.invoices)
        .innerJoin(schema.customers, eq(schema.invoices.customerId, schema.customers.id))
        .where(
          and(
            eq(schema.invoices.organizationId, organizationId),
            inArray(schema.invoices.status, ['pending', 'overdue']),
            p.email
              ? or(
                  eq(schema.customers.patientId, patientId),
                  eq(schema.customers.email, p.email),
                )!
              : eq(schema.customers.patientId, patientId),
          ),
        ),
      db
        .select({
          totalCents: schema.invoices.totalCents,
        })
        .from(schema.invoices)
        .innerJoin(schema.customers, eq(schema.invoices.customerId, schema.customers.id))
        .where(
          and(
            eq(schema.invoices.organizationId, organizationId),
            eq(schema.invoices.status, 'paid'),
            p.email
              ? or(
                  eq(schema.customers.patientId, patientId),
                  eq(schema.customers.email, p.email),
                )!
              : eq(schema.customers.patientId, patientId),
          ),
        ),
      db
        .select({ id: schema.formSubmission.id })
        .from(schema.formSubmission)
        .where(
          and(
            eq(schema.formSubmission.organizationId, organizationId),
            eq(schema.formSubmission.patientId, patientId),
          ),
        )
        .limit(1),
      db
        .select({ id: schema.appointment.id })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, organizationId),
            eq(schema.appointment.patientId, patientId),
            eq(schema.appointment.status, 'scheduled'),
            gte(schema.appointment.startTime, now),
            lte(schema.appointment.startTime, in48h),
          ),
        )
        .limit(1),
    ])

  const outstanding = unpaidRows.reduce<number>((acc, r) => acc + Number(r.totalCents ?? 0), 0)
  const ltv = paidRows.reduce<number>((acc, r) => acc + Number(r.totalCents ?? 0), 0)
  const lastVisitAt = lastVisit[0]?.startTime ?? null
  const next = nextVisit[0]
    ? { startTime: nextVisit[0].startTime, type: nextVisit[0].type }
    : null
  const hasIntake = intakeRows.length > 0
  const newPatient = (p.lifecycle ?? 'active') === 'new' || !lastVisitAt
  const lapsed = !!lastVisitAt && lastVisitAt < lapsedCutoff && !next
  const missingIntakeBeforeAppt = !!next && next.startTime <= in7d && !hasIntake

  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: `${p.firstName} ${p.lastName}`,
    email: p.email,
    phone: p.phone,
    dateOfBirth: p.dateOfBirth,
    ageYears: ageFromDob(p.dateOfBirth),
    addressLine1: p.addressLine1,
    city: p.city,
    state: p.state,
    postalCode: p.postalCode,
    insuranceProvider: p.insuranceProvider,
    insurancePolicyNumber: p.insurancePolicyNumber,
    insuranceGroupNumber: p.insuranceGroupNumber,
    notes: p.notes,
    source: p.source,
    lifecycle: (p.lifecycle ?? 'active') as PatientLifecycle,
    firstSeenAt: p.firstSeenAt,
    lastActivityAt: p.lastActivityAt,
    hasPortalAccount: !!p.userId,
    guardianPatientId: p.guardianPatientId ?? null,
    flags: {
      newPatient,
      birthdayThisWeek: isBirthdayThisWeek(p.dateOfBirth, now),
      hasOutstandingBalance: outstanding > 0,
      missingIntakeBeforeAppt,
      unconfirmedNext48h: unconfirmedRow.length > 0,
      lapsed,
      optedOut: p.marketingEmailOptIn === 0,
    },
    outstandingBalanceCents: outstanding,
    lifetimeValueCents: ltv,
    lastVisitAt,
    nextVisitAt: next?.startTime ?? null,
    nextVisitType: next?.type ?? null,
    totalBookings: Number(bookingCount[0]?.count ?? 0),
  }
}

// ----- Mutations --------------------------------------------------------

export interface CreatePatientInput {
  organizationId: string
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  dateOfBirth?: string | null
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  insuranceProvider?: string | null
  insurancePolicyNumber?: string | null
  insuranceGroupNumber?: string | null
  source?: PatientSource | null
  lifecycle?: PatientLifecycle
  notes?: string | null
  // Family access (patient portal): the patient whose portal login may see
  // and manage this patient. Null = no guardian.
  guardianPatientId?: string | null
  /**
   * Skip the email/phone dedupe pre-check and insert regardless. The "Add
   * anyway" escape hatch for legitimate same-contact cases (a child sharing a
   * parent's phone/email — common in pediatric dental).
   */
  forceNew?: boolean
}

export type CreatePatientResult =
  | { id: string }
  | { duplicateOf: { id: string; name: string } }

/**
 * Insert a patient — unless an active patient with the same normalized email
 * or phone already exists in the org (then return `{ duplicateOf }` so the UI
 * can offer "open their record" vs "Add anyway"). Normalization matches the
 * rest of the app (`lib/contact-normalize.ts`), so a created patient won't
 * later look like a duplicate of an imported/converted one.
 */
export async function createPatient(input: CreatePatientInput): Promise<CreatePatientResult> {
  const ne = normalizeEmail(input.email)
  const np = normalizePhone(input.phone)
  if (!input.forceNew && (ne || np)) {
    const candidates = await db
      .select({
        id: schema.patient.id,
        firstName: schema.patient.firstName,
        lastName: schema.patient.lastName,
        email: schema.patient.email,
        phone: schema.patient.phone,
      })
      .from(schema.patient)
      .where(and(eq(schema.patient.organizationId, input.organizationId), eq(schema.patient.isActive, 1)))
      .limit(2000)
    const match = candidates.find(
      (c) => (ne && normalizeEmail(c.email) === ne) || (np && normalizePhone(c.phone) === np),
    )
    if (match) {
      return { duplicateOf: { id: match.id, name: `${match.firstName} ${match.lastName}`.trim() } }
    }
  }

  const id = newPatientId()
  const now = new Date()
  await db.insert(schema.patient).values({
    id,
    organizationId: input.organizationId,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email ?? null,
    phone: input.phone ?? null,
    dateOfBirth: input.dateOfBirth ?? null,
    addressLine1: input.addressLine1 ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    postalCode: input.postalCode ?? null,
    insuranceProvider: input.insuranceProvider ?? null,
    insurancePolicyNumber: input.insurancePolicyNumber ?? null,
    insuranceGroupNumber: input.insuranceGroupNumber ?? null,
    source: input.source ?? null,
    lifecycle: input.lifecycle ?? 'new',
    firstSeenAt: now,
    notes: input.notes ?? null,
  })
  return { id }
}

export interface UpdatePatientInput {
  organizationId: string
  patientId: string
  patch: Partial<Omit<CreatePatientInput, 'organizationId'>>
}

export async function updatePatient({ organizationId, patientId, patch }: UpdatePatientInput) {
  // Guardian linkage is a portal-access grant — validate before writing:
  // same org, not self, and the guardian can't be someone's dependent
  // themselves (one-level family tree; rules out cycles entirely).
  if (patch.guardianPatientId) {
    if (patch.guardianPatientId === patientId) {
      throw new Error('A patient can’t be their own guardian')
    }
    const [guardian] = await db
      .select({ id: schema.patient.id, guardianPatientId: schema.patient.guardianPatientId })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, organizationId),
          eq(schema.patient.id, patch.guardianPatientId),
        ),
      )
      .limit(1)
    if (!guardian) throw new Error('Guardian patient not found')
    if (guardian.guardianPatientId) {
      throw new Error('That patient is a dependent themselves — pick the family’s account holder')
    }
  }

  const update: Record<string, unknown> = { updatedAt: new Date() }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    update[key] = value
  }
  await db
    .update(schema.patient)
    .set(update)
    .where(
      and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)),
    )
}

/** Lightweight id+name list for pickers (e.g. the guardian select). */
export async function listPatientOptions(
  organizationId: string,
): Promise<Array<{ id: string; name: string }>> {
  const rows = await db
    .select({
      id: schema.patient.id,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
    })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.isActive, 1)))
    .orderBy(schema.patient.firstName, schema.patient.lastName)
    .limit(500)
  return rows.map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}` }))
}

export async function archivePatient(organizationId: string, patientId: string) {
  await db
    .update(schema.patient)
    .set({ isActive: 0, lifecycle: 'archived', updatedAt: new Date() })
    .where(
      and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)),
    )
}

export async function touchPatientActivity(organizationId: string, patientId: string, at: Date = new Date()) {
  await db
    .update(schema.patient)
    .set({ lastActivityAt: at, updatedAt: new Date() })
    .where(
      and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.id, patientId)),
    )
}

// Link a customers row to a patient when we discover the same human. Idempotent.
export async function linkCustomerToPatient(customerId: number, patientId: string) {
  await db
    .update(schema.customers)
    .set({ patientId, updatedAt: new Date() })
    .where(and(eq(schema.customers.id, customerId), isNull(schema.customers.patientId)))
}
