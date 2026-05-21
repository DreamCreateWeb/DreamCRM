import 'server-only'
import { and, asc, count, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { randomBytes } from 'crypto'

/**
 * Leads service — public-website inbound prospects.
 *
 * Distinct from Patients on purpose: a lead is a person who filled out
 * the contact form on the public clinic site but has NOT yet booked or
 * been touched by a staff member. Once a lead converts (front-desk
 * clicks "Convert to patient"), a `patient` row is created and the
 * `lead.convertedToPatientId` pointer is set — the lead row stays for
 * source attribution + analytics. We do not delete leads.
 *
 * Lifecycle: `new` → `contacted` → `converted` (or → `archived` at any
 * point for spam / wrong number / duplicate).
 */

export type LeadStatus = 'new' | 'contacted' | 'converted' | 'archived'

export interface LeadRow {
  id: string
  name: string
  email: string | null
  phone: string
  preferredDate: string | null
  message: string | null
  sourcePage: string | null
  referrer: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  status: LeadStatus
  convertedToPatientId: string | null
  convertedPatientName: string | null
  contactedAt: Date | null
  convertedAt: Date | null
  archivedAt: Date | null
  archivedReason: string | null
  createdAt: Date
  /** Hours since the lead landed — drives the aging tint on new rows. */
  ageHours: number
}

export interface LeadListFilters {
  status?: LeadStatus | 'all'
  search?: string
}

export interface LeadCounts {
  new: number
  contacted: number
  converted: number
  archived: number
  total: number
}

export function newLeadId(): string {
  return `lead_${randomBytes(10).toString('hex')}`
}

// ----- List + counts ----------------------------------------------------

export async function listLeads(
  organizationId: string,
  filters: LeadListFilters = {},
): Promise<LeadRow[]> {
  const where = [eq(schema.lead.organizationId, organizationId)]
  if (filters.status && filters.status !== 'all') {
    where.push(eq(schema.lead.status, filters.status))
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = `%${filters.search.trim().toLowerCase()}%`
    const phoneDigits = filters.search.replace(/\D/g, '')
    const phoneQ = phoneDigits.length >= 3 ? `%${phoneDigits}%` : null
    where.push(
      or(
        sql`lower(${schema.lead.name}) like ${q}`,
        sql`lower(coalesce(${schema.lead.email}, '')) like ${q}`,
        sql`lower(coalesce(${schema.lead.message}, '')) like ${q}`,
        phoneQ
          ? sql`regexp_replace(coalesce(${schema.lead.phone}, ''), '\\D', '', 'g') like ${phoneQ}`
          : sql`false`,
      )!,
    )
  }

  const rows = await db
    .select({
      id: schema.lead.id,
      name: schema.lead.name,
      email: schema.lead.email,
      phone: schema.lead.phone,
      preferredDate: schema.lead.preferredDate,
      message: schema.lead.message,
      sourcePage: schema.lead.sourcePage,
      referrer: schema.lead.referrer,
      utmSource: schema.lead.utmSource,
      utmMedium: schema.lead.utmMedium,
      utmCampaign: schema.lead.utmCampaign,
      status: schema.lead.status,
      convertedToPatientId: schema.lead.convertedToPatientId,
      contactedAt: schema.lead.contactedAt,
      convertedAt: schema.lead.convertedAt,
      archivedAt: schema.lead.archivedAt,
      archivedReason: schema.lead.archivedReason,
      createdAt: schema.lead.createdAt,
      convertedPatientFirstName: schema.patient.firstName,
      convertedPatientLastName: schema.patient.lastName,
    })
    .from(schema.lead)
    .leftJoin(schema.patient, eq(schema.lead.convertedToPatientId, schema.patient.id))
    .where(and(...where))
    .orderBy(desc(schema.lead.createdAt))

  const now = Date.now()
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    preferredDate: r.preferredDate,
    message: r.message,
    sourcePage: r.sourcePage,
    referrer: r.referrer,
    utmSource: r.utmSource,
    utmMedium: r.utmMedium,
    utmCampaign: r.utmCampaign,
    status: r.status as LeadStatus,
    convertedToPatientId: r.convertedToPatientId,
    convertedPatientName: r.convertedPatientFirstName
      ? `${r.convertedPatientFirstName} ${r.convertedPatientLastName ?? ''}`.trim()
      : null,
    contactedAt: r.contactedAt,
    convertedAt: r.convertedAt,
    archivedAt: r.archivedAt,
    archivedReason: r.archivedReason,
    createdAt: r.createdAt,
    ageHours: Math.round((now - r.createdAt.getTime()) / (60 * 60 * 1000)),
  }))
}

export async function getLeadCounts(organizationId: string): Promise<LeadCounts> {
  const rows = await db
    .select({
      status: schema.lead.status,
      count: count(),
    })
    .from(schema.lead)
    .where(eq(schema.lead.organizationId, organizationId))
    .groupBy(schema.lead.status)
  const counts: LeadCounts = { new: 0, contacted: 0, converted: 0, archived: 0, total: 0 }
  for (const r of rows) {
    const n = Number(r.count)
    counts.total += n
    if (r.status === 'new') counts.new = n
    else if (r.status === 'contacted') counts.contacted = n
    else if (r.status === 'converted') counts.converted = n
    else if (r.status === 'archived') counts.archived = n
  }
  return counts
}

// Lightweight "how many new leads landed since this timestamp" — used
// by the Overview attention card so we can phrase it as "3 since
// yesterday" without loading every row.
export async function getNewLeadsSince(organizationId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(schema.lead)
    .where(
      and(
        eq(schema.lead.organizationId, organizationId),
        eq(schema.lead.status, 'new'),
        sql`${schema.lead.createdAt} >= ${since}`,
      ),
    )
  return Number(row?.count ?? 0)
}

// ----- Detail (drawer) --------------------------------------------------

export async function getLeadDetail(organizationId: string, id: string): Promise<LeadRow | null> {
  const rows = await listLeads(organizationId, {})
  return rows.find((r) => r.id === id) ?? null
}

// ----- Mutations --------------------------------------------------------

export async function markLeadContacted(organizationId: string, id: string) {
  await db
    .update(schema.lead)
    .set({ status: 'contacted', contactedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.lead.organizationId, organizationId), eq(schema.lead.id, id)))
}

export async function archiveLead(organizationId: string, id: string, reason: string | null) {
  await db
    .update(schema.lead)
    .set({
      status: 'archived',
      archivedAt: new Date(),
      archivedReason: reason,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.lead.organizationId, organizationId), eq(schema.lead.id, id)))
}

export async function reopenLead(organizationId: string, id: string) {
  // Bring an archived or contacted lead back to 'new' if staff realizes
  // they were wrong to dismiss it.
  await db
    .update(schema.lead)
    .set({
      status: 'new',
      archivedAt: null,
      archivedReason: null,
      contactedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.lead.organizationId, organizationId), eq(schema.lead.id, id)))
}

export interface ConvertLeadResult { leadId: string; patientId: string }

/**
 * Convert a lead into a real patient. Splits the lead's single `name`
 * field into firstName/lastName on a best-effort basis (everything
 * after the first space becomes lastName). Sets `patient.source =
 * 'lead_form'` so the Patients module's source filter can identify
 * lead-converted rows. Idempotent: if the lead is already converted,
 * returns the existing patient id.
 */
export async function convertLeadToPatient(
  organizationId: string,
  id: string,
): Promise<ConvertLeadResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.lead)
      .where(and(eq(schema.lead.organizationId, organizationId), eq(schema.lead.id, id)))
      .limit(1)
    if (!existing) throw new Error('Lead not found')
    if (existing.convertedToPatientId) {
      return { leadId: existing.id, patientId: existing.convertedToPatientId }
    }

    const trimmed = existing.name.trim()
    const firstSpace = trimmed.indexOf(' ')
    const firstName = firstSpace >= 0 ? trimmed.slice(0, firstSpace) : trimmed
    const lastName = firstSpace >= 0 ? trimmed.slice(firstSpace + 1).trim() : ''

    // If a patient already exists with this email or phone, reuse them
    // rather than creating a duplicate.
    const dupes = await tx
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, organizationId),
          or(
            existing.email ? eq(schema.patient.email, existing.email) : sql`false`,
            eq(schema.patient.phone, existing.phone),
          )!,
        ),
      )
      .limit(1)

    const patientId = dupes[0]?.id ?? `pat_${randomBytes(10).toString('hex')}`
    if (!dupes[0]) {
      const now = new Date()
      await tx.insert(schema.patient).values({
        id: patientId,
        organizationId,
        firstName: firstName || 'Unknown',
        lastName: lastName || '',
        email: existing.email,
        phone: existing.phone,
        isActive: 1,
        source: 'lead_form',
        lifecycle: 'new',
        firstSeenAt: existing.createdAt,
        lastActivityAt: now,
      })
    }

    await tx
      .update(schema.lead)
      .set({
        status: 'converted',
        convertedToPatientId: patientId,
        convertedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.lead.id, id))

    return { leadId: existing.id, patientId }
  })
}

// ----- Insert (called from the public contact form) --------------------

export interface CreateLeadInput {
  organizationId: string
  name: string
  phone: string
  email?: string | null
  preferredDate?: string | null
  message?: string | null
  sourcePage?: string | null
  referrer?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
}

export async function createLead(input: CreateLeadInput): Promise<string> {
  const id = newLeadId()
  await db.insert(schema.lead).values({
    id,
    organizationId: input.organizationId,
    name: input.name,
    phone: input.phone,
    email: input.email ?? null,
    preferredDate: input.preferredDate ?? null,
    message: input.message ?? null,
    sourcePage: input.sourcePage ?? null,
    referrer: input.referrer ?? null,
    utmSource: input.utmSource ?? null,
    utmMedium: input.utmMedium ?? null,
    utmCampaign: input.utmCampaign ?? null,
  })
  return id
}

// Silence unused-import lint while keeping `isNull` + `asc` available
// for future filters (e.g. "leads with no message", "leads sorted oldest first").
export const _internal = { isNull, asc }
