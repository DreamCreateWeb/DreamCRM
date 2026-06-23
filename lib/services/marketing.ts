import 'server-only'
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { derivePatientRecallStatus } from '@/lib/services/recall-status'
import { getTagsForPatients } from '@/lib/services/patient-tags'

/**
 * Marketing service: lead pipeline (customers table extended with stage/source),
 * audiences, and pipeline-level analytics. Campaign send + tracking lives in
 * lib/services/campaigns-send.ts (PR 2).
 *
 * Every read/write is org-scoped. The customers table already has an
 * `organization_id` FK; passing `organizationId` on insert + filtering on it
 * for every select keeps rows naturally segregated.
 */

const StageKey = z.string().min(1).max(40)
const Source = z.string().min(1).max(80)

export const LeadInput = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(40).optional().nullable(),
  location: z.string().max(120).optional().nullable(),
  pipelineStage: StageKey.default('new'),
  leadSource: Source.optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
})

export const LeadUpdate = LeadInput.partial()

export interface PipelineCounts {
  /** { stageKey: count } */
  byStage: Record<string, number>
  /** total non-archived rows in this org */
  total: number
  /** opted-out subset (excluded from sends) */
  optedOut: number
}

export async function listLeads(
  organizationId: string,
  opts: { search?: string; stage?: string; source?: string; includeArchived?: boolean } = {},
) {
  const filters = [
    eq(schema.customers.organizationId, organizationId),
    eq(schema.customers.archived, opts.includeArchived ?? false),
  ]
  if (opts.search) {
    filters.push(
      or(
        ilike(schema.customers.name, `%${opts.search}%`),
        ilike(schema.customers.email, `%${opts.search}%`),
      )!,
    )
  }
  if (opts.stage) filters.push(eq(schema.customers.pipelineStage, opts.stage))
  if (opts.source) filters.push(eq(schema.customers.leadSource, opts.source))

  return db
    .select()
    .from(schema.customers)
    .where(and(...filters))
    .orderBy(desc(schema.customers.lastActivityAt), desc(schema.customers.createdAt))
}

export async function getLead(organizationId: string, id: number) {
  const [row] = await db
    .select()
    .from(schema.customers)
    .where(and(eq(schema.customers.id, id), eq(schema.customers.organizationId, organizationId)))
    .limit(1)
  return row ?? null
}

export async function createLead(
  organizationId: string,
  input: z.infer<typeof LeadInput>,
  ownerId: string,
) {
  const data = LeadInput.parse(input)
  const [row] = await db
    .insert(schema.customers)
    .values({
      organizationId,
      ownerId,
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      location: data.location ?? null,
      pipelineStage: data.pipelineStage,
      leadSource: data.leadSource ?? null,
      notes: data.notes ?? null,
      lastActivityAt: new Date(),
    })
    .returning()
  return row
}

export async function updateLead(
  organizationId: string,
  id: number,
  input: z.infer<typeof LeadUpdate>,
) {
  const data = LeadUpdate.parse(input)
  const [row] = await db
    .update(schema.customers)
    .set({
      ...data,
      updatedAt: new Date(),
      lastActivityAt: new Date(),
    })
    .where(and(eq(schema.customers.id, id), eq(schema.customers.organizationId, organizationId)))
    .returning()
  return row ?? null
}

export async function moveLead(
  organizationId: string,
  id: number,
  stage: string,
) {
  const [row] = await db
    .update(schema.customers)
    .set({ pipelineStage: stage, lastActivityAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.customers.id, id), eq(schema.customers.organizationId, organizationId)))
    .returning({ id: schema.customers.id, pipelineStage: schema.customers.pipelineStage })
  return row ?? null
}

export async function archiveLead(organizationId: string, id: number) {
  const [row] = await db
    .update(schema.customers)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(schema.customers.id, id), eq(schema.customers.organizationId, organizationId)))
    .returning({ id: schema.customers.id })
  return row ?? null
}

export async function setOptedOut(organizationId: string, id: number, optedOut: boolean) {
  const [row] = await db
    .update(schema.customers)
    .set({ optedOut, updatedAt: new Date() })
    .where(and(eq(schema.customers.id, id), eq(schema.customers.organizationId, organizationId)))
    .returning({ id: schema.customers.id, optedOut: schema.customers.optedOut })
  return row ?? null
}

/** Per-stage counts + totals for the dashboard funnel + pipeline header. */
export async function getPipelineCounts(organizationId: string): Promise<PipelineCounts> {
  const rows = await db
    .select({
      stage: schema.customers.pipelineStage,
      count: sql<number>`count(*)::int`,
      optedOut: sql<number>`sum(case when ${schema.customers.optedOut} then 1 else 0 end)::int`,
    })
    .from(schema.customers)
    .where(
      and(
        eq(schema.customers.organizationId, organizationId),
        eq(schema.customers.archived, false),
      ),
    )
    .groupBy(schema.customers.pipelineStage)

  const byStage: Record<string, number> = {}
  let total = 0
  let optedOut = 0
  for (const r of rows) {
    byStage[r.stage] = r.count
    total += r.count
    optedOut += r.optedOut
  }
  return { byStage, total, optedOut }
}

/** Funnel summary for the dashboard. Returns an ordered list of {stage,count}. */
export async function getFunnel(organizationId: string, stageKeys: string[]) {
  const counts = await getPipelineCounts(organizationId)
  return stageKeys.map((stage) => ({ stage, count: counts.byStage[stage] ?? 0 }))
}

/** Recent activity feed for the dashboard — last N leads with activity. */
export async function listRecentActivity(organizationId: string, limit = 8) {
  return db
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      email: schema.customers.email,
      pipelineStage: schema.customers.pipelineStage,
      lastActivityAt: schema.customers.lastActivityAt,
      createdAt: schema.customers.createdAt,
    })
    .from(schema.customers)
    .where(
      and(
        eq(schema.customers.organizationId, organizationId),
        eq(schema.customers.archived, false),
      ),
    )
    .orderBy(desc(schema.customers.lastActivityAt), desc(schema.customers.createdAt))
    .limit(limit)
}

// ---------- Audiences ----------
// Two filter shapes share the audiences table, discriminated by
// `recipient_source`:
//
//   - 'customers' — platform-tenant SaaS lead pipeline. Filter cuts on
//     pipeline stage, lead source, last-activity window.
//
//   - 'patients' — clinic-tenant dental Recall & Outreach. Filter cuts on
//     lifecycle, recall status, last-visit window, birthday-this-month,
//     outstanding-balance, channel opt-in. Mirrors `PatientListFilters` so
//     audiences match what the front desk sees on the patients page.
//
// `resolveAudience` dispatches between `resolveCustomerAudience` and
// `resolvePatientAudience` based on `recipientSource`. Both return the
// same recipient row shape (id stringified for patients) so the send
// orchestrator doesn't need to branch.

export const AudienceFilter = z.object({
  stages: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  lifecycleStages: z.array(z.string()).optional(),
  /** Limit to leads with activity in the last N days (-1 = inactivity bucket). */
  lastActivityWithinDays: z.number().int().optional(),
  /** Include opted-out (default false — never include for marketing sends). */
  includeOptedOut: z.boolean().optional(),
})

export type AudienceFilterT = z.infer<typeof AudienceFilter>

// Dental patient audience filter. Mirrors PatientListFilters where there's
// overlap (lifecycles / sources / hasOutstandingBalance / birthdayThisMonth)
// and adds marketing-specific concerns (channel opt-in, recall status).
// Channel opt-in defaults to "require email opt-in, no SMS opt-in required"
// since most campaigns are email; flip requireSmsOptIn when channel='sms'.
export const PatientAudienceFilter = z.object({
  lifecycles: z.array(z.enum(['lead', 'new', 'active', 'at_risk', 'lapsed', 'archived'])).optional(),
  sources: z.array(z.string()).optional(),
  /** 'due' | 'overdue' | 'scheduled' | 'na' — derived field, applied post-query */
  recallStatuses: z.array(z.enum(['due', 'overdue', 'scheduled', 'na'])).optional(),
  /** At least N days since last completed visit */
  lastVisitAtLeastDaysAgo: z.number().int().min(0).optional(),
  /** Last completed visit within the last N days (new-patient bucket) */
  lastVisitWithinDays: z.number().int().min(0).optional(),
  /** Outstanding balance > 0 cents */
  hasOutstandingBalance: z.boolean().optional(),
  /** Birthday falls in the current calendar month */
  birthdayThisMonth: z.boolean().optional(),
  /** Birthday is today (month + day match) — drives the birthday auto-send */
  birthdayToday: z.boolean().optional(),
  /** Has a scheduled (unconfirmed) appointment in the next N hours */
  hasUnconfirmedNextHours: z.number().int().min(0).optional(),
  /** Keep only patients carrying ANY of these CRM tag ids (OR semantics). */
  tagIds: z.array(z.string()).optional(),
  /** Require marketing_email_opt_in=1 (default true — always for email sends) */
  requireEmailOptIn: z.boolean().default(true),
  /** Require marketing_sms_opt_in=1 (set true for SMS campaign sends) */
  requireSmsOptIn: z.boolean().default(false),
  /** Include lifecycle='lapsed'|'archived' (default false) */
  includeArchived: z.boolean().default(false),
})

export type PatientAudienceFilterT = z.infer<typeof PatientAudienceFilter>

export const AudienceInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  recipientSource: z.enum(['customers', 'patients']).default('customers'),
  filter: AudienceFilter.optional(),
  patientFilter: PatientAudienceFilter.optional(),
})

export interface ResolvedRecipient {
  /** Stringified customers.id (numeric) or patient.id (text). */
  id: string
  /** Source row primary key in its native type — for tagging back on send. */
  customerId: number | null
  patientId: string | null
  firstName: string
  name: string
  email: string | null
  phone: string | null
  /** From patient.marketingEmailOptIn / customers.optedOut → derived */
  emailOptIn: boolean
  /** From patient.marketingSmsOptIn — null for customer source. */
  smsOptIn: boolean
}

export async function listAudiences(organizationId: string) {
  return db
    .select()
    .from(schema.audiences)
    .where(eq(schema.audiences.organizationId, organizationId))
    .orderBy(desc(schema.audiences.createdAt))
}

export async function createAudience(
  organizationId: string,
  input: z.infer<typeof AudienceInput>,
  userId: string,
) {
  const data = AudienceInput.parse(input)
  const [row] = await db
    .insert(schema.audiences)
    .values({
      organizationId,
      name: data.name,
      description: data.description ?? null,
      recipientSource: data.recipientSource,
      filter: data.filter ?? {},
      patientFilter: data.patientFilter ?? {},
      createdBy: userId,
    })
    .returning()
  return row
}

export async function updateAudience(
  organizationId: string,
  id: number,
  input: Partial<z.infer<typeof AudienceInput>>,
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.recipientSource !== undefined) patch.recipientSource = input.recipientSource
  if (input.filter !== undefined) patch.filter = input.filter
  if (input.patientFilter !== undefined) patch.patientFilter = input.patientFilter
  const [row] = await db
    .update(schema.audiences)
    .set(patch)
    .where(and(eq(schema.audiences.id, id), eq(schema.audiences.organizationId, organizationId)))
    .returning()
  return row ?? null
}

export async function deleteAudience(organizationId: string, id: number) {
  const rows = await db
    .delete(schema.audiences)
    .where(and(eq(schema.audiences.id, id), eq(schema.audiences.organizationId, organizationId)))
    .returning({ id: schema.audiences.id })
  return { deleted: rows.length }
}

/**
 * Top-level audience resolver. Dispatches to the customer or patient
 * resolver based on `recipientSource`. Both return ResolvedRecipient[] so
 * the send orchestrator doesn't need to branch on source.
 */
export async function resolveAudience(
  organizationId: string,
  opts: {
    recipientSource?: 'customers' | 'patients'
    filter?: AudienceFilterT
    patientFilter?: PatientAudienceFilterT
  },
): Promise<ResolvedRecipient[]> {
  if (opts.recipientSource === 'patients') {
    return resolvePatientAudience(organizationId, opts.patientFilter ?? {} as PatientAudienceFilterT)
  }
  return resolveCustomerAudience(organizationId, opts.filter ?? {} as AudienceFilterT)
}

/**
 * Materialize a customer-source filter into recipient rows. Always excludes
 * opted-out and archived unless `includeOptedOut` is set.
 */
export async function resolveCustomerAudience(
  organizationId: string,
  filter: AudienceFilterT,
): Promise<ResolvedRecipient[]> {
  const where = [
    eq(schema.customers.organizationId, organizationId),
    eq(schema.customers.archived, false),
  ]
  if (!filter.includeOptedOut) where.push(eq(schema.customers.optedOut, false))
  if (filter.stages?.length) where.push(inArray(schema.customers.pipelineStage, filter.stages))
  if (filter.lifecycleStages?.length) where.push(inArray(schema.customers.lifecycleStage, filter.lifecycleStages))
  if (filter.sources?.length) where.push(inArray(schema.customers.leadSource, filter.sources))
  if (filter.lastActivityWithinDays != null) {
    if (filter.lastActivityWithinDays >= 0) {
      const cutoff = new Date(Date.now() - filter.lastActivityWithinDays * 86400_000)
      where.push(gte(schema.customers.lastActivityAt, cutoff))
    } else {
      // Inactivity bucket: NULL last_activity_at OR older than |N| days
      const cutoff = new Date(Date.now() + filter.lastActivityWithinDays * 86400_000)
      where.push(or(isNull(schema.customers.lastActivityAt), sql`${schema.customers.lastActivityAt} < ${cutoff}`)!)
    }
  }
  const rows = await db
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      email: schema.customers.email,
      phone: schema.customers.phone,
      optedOut: schema.customers.optedOut,
    })
    .from(schema.customers)
    .where(and(...where))
  return rows.map((r) => ({
    id: String(r.id),
    customerId: r.id,
    patientId: null,
    firstName: r.name.split(' ')[0] || r.name,
    name: r.name,
    email: r.email,
    phone: r.phone,
    emailOptIn: !r.optedOut,
    smsOptIn: false,
  }))
}

/**
 * Materialize a patient-source filter into recipient rows. Mirrors the
 * derivation logic in `listPatients` so audience previews show the same
 * counts the patient list shows. Channel opt-in (email or sms) is
 * enforced here — recipients without the requested opt-in are dropped.
 *
 * Derived fields (recall status / has-balance / unconfirmed-next-Nh) are
 * computed in JS after the patient rows are fetched, because they depend
 * on joins to appointment + invoices that are easier to express
 * imperatively than as SQL predicates.
 */
export async function resolvePatientAudience(
  organizationId: string,
  filter: PatientAudienceFilterT,
): Promise<ResolvedRecipient[]> {
  const parsed = PatientAudienceFilter.parse(filter)
  const now = new Date()

  const where = [eq(schema.patient.organizationId, organizationId)]
  if (!parsed.includeArchived) where.push(eq(schema.patient.isActive, 1))
  if (parsed.lifecycles?.length) where.push(inArray(schema.patient.lifecycle, parsed.lifecycles))
  if (parsed.sources?.length) where.push(inArray(schema.patient.source, parsed.sources))
  if (parsed.requireEmailOptIn) where.push(eq(schema.patient.marketingEmailOptIn, 1))
  if (parsed.requireSmsOptIn) where.push(eq(schema.patient.marketingSmsOptIn, 1))

  const patients = await db
    .select({
      id: schema.patient.id,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      email: schema.patient.email,
      phone: schema.patient.phone,
      dateOfBirth: schema.patient.dateOfBirth,
      lifecycle: schema.patient.lifecycle,
      marketingEmailOptIn: schema.patient.marketingEmailOptIn,
      marketingSmsOptIn: schema.patient.marketingSmsOptIn,
      pmsRecallDueAt: schema.patient.pmsRecallDueAt,
      pmsBalanceCents: schema.patient.pmsBalanceCents,
    })
    .from(schema.patient)
    .where(and(...where))

  if (patients.length === 0) return []

  const needLastVisit =
    parsed.lastVisitAtLeastDaysAgo != null ||
    parsed.lastVisitWithinDays != null ||
    parsed.recallStatuses?.length
  const needUpcoming = parsed.recallStatuses?.length || parsed.hasUnconfirmedNextHours != null

  const ids = patients.map((p) => p.id)

  // Tag targeting — only resolve when the filter asks for it. Build a per-patient
  // tag-id set so the post-query predicate is O(1).
  const tagSetByPatient = new Map<string, Set<string>>()
  if (parsed.tagIds?.length) {
    const tagMap = await getTagsForPatients(organizationId, ids)
    tagMap.forEach((tags, pid) => tagSetByPatient.set(pid, new Set(tags.map((t) => t.id))))
  }

  const [lastVisitRows, upcomingRows, unconfirmedRows] = await Promise.all([
    needLastVisit
      ? db
          .select({ patientId: schema.appointment.patientId, startTime: schema.appointment.startTime })
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
          .orderBy(desc(schema.appointment.startTime))
      : Promise.resolve([] as { patientId: string; startTime: Date }[]),
    needUpcoming
      ? db
          .select({ patientId: schema.appointment.patientId, startTime: schema.appointment.startTime, status: schema.appointment.status })
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
      : Promise.resolve([] as { patientId: string; startTime: Date; status: string }[]),
    parsed.hasUnconfirmedNextHours != null
      ? db
          .select({ patientId: schema.appointment.patientId })
          .from(schema.appointment)
          .where(
            and(
              eq(schema.appointment.organizationId, organizationId),
              inArray(schema.appointment.patientId, ids),
              eq(schema.appointment.status, 'scheduled'),
              gte(schema.appointment.startTime, now),
              lte(schema.appointment.startTime, new Date(now.getTime() + parsed.hasUnconfirmedNextHours * 3600_000)),
            ),
          )
      : Promise.resolve([] as { patientId: string }[]),
  ])

  // Build per-patient lookup maps. We dedupe last-visit to MAX (most recent) and
  // upcoming to MIN (next future).
  const lastVisitMap = new Map<string, Date>()
  for (const r of lastVisitRows) {
    if (!lastVisitMap.has(r.patientId)) lastVisitMap.set(r.patientId, r.startTime)
  }
  const upcomingMap = new Map<string, { startTime: Date; status: string }>()
  for (const r of upcomingRows) {
    const cur = upcomingMap.get(r.patientId)
    if (!cur || r.startTime < cur.startTime) upcomingMap.set(r.patientId, { startTime: r.startTime, status: r.status })
  }
  const unconfirmedSet = new Set(unconfirmedRows.map((r) => r.patientId))

  // Recall status: shared helper with the patients list. Prefers the PMS
  // recall date when present (Integrations sync); falls back to the
  // appointment-derived heuristic otherwise.
  return patients
    .map((p) => {
      const lastVisitAt = lastVisitMap.get(p.id) ?? null
      const upcoming = upcomingMap.get(p.id) ?? null
      const balance = p.pmsBalanceCents ?? 0
      const recallStatus = derivePatientRecallStatus({
        pmsRecallDueAt: p.pmsRecallDueAt,
        hasUpcomingAppt: !!upcoming,
        hasAnyFutureAppt: !!upcoming,
        lastVisitAt,
        now,
      })

      return {
        p,
        lastVisitAt,
        upcoming,
        balance,
        recallStatus,
      }
    })
    .filter((r) => {
      if (parsed.recallStatuses?.length && !parsed.recallStatuses.includes(r.recallStatus)) return false
      if (parsed.lastVisitAtLeastDaysAgo != null) {
        if (!r.lastVisitAt) return false
        const ageMs = now.getTime() - r.lastVisitAt.getTime()
        if (ageMs < parsed.lastVisitAtLeastDaysAgo * 86400_000) return false
      }
      if (parsed.lastVisitWithinDays != null) {
        if (!r.lastVisitAt) return false
        const ageMs = now.getTime() - r.lastVisitAt.getTime()
        if (ageMs > parsed.lastVisitWithinDays * 86400_000) return false
      }
      if (parsed.hasOutstandingBalance != null) {
        if (parsed.hasOutstandingBalance && r.balance <= 0) return false
        if (!parsed.hasOutstandingBalance && r.balance > 0) return false
      }
      if (parsed.birthdayThisMonth) {
        const m = r.p.dateOfBirth?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (!m) return false
        if (parseInt(m[2], 10) - 1 !== now.getMonth()) return false
      }
      if (parsed.birthdayToday) {
        const m = r.p.dateOfBirth?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (!m) return false
        // Match month + day-of-month against "today". Feb-29 birthdays fall on
        // Mar-1 in common years (no Feb-29 to match) — acceptable for a greeting.
        if (parseInt(m[2], 10) - 1 !== now.getMonth()) return false
        if (parseInt(m[3], 10) !== now.getDate()) return false
      }
      if (parsed.hasUnconfirmedNextHours != null && !unconfirmedSet.has(r.p.id)) return false
      if (parsed.tagIds?.length) {
        const have = tagSetByPatient.get(r.p.id)
        if (!have || !parsed.tagIds.some((id) => have.has(id))) return false
      }
      return true
    })
    .map((r) => ({
      id: r.p.id,
      customerId: null,
      patientId: r.p.id,
      firstName: r.p.firstName,
      name: `${r.p.firstName} ${r.p.lastName}`.trim(),
      email: r.p.email,
      phone: r.p.phone,
      emailOptIn: r.p.marketingEmailOptIn === 1,
      smsOptIn: r.p.marketingSmsOptIn === 1,
    }))
}
