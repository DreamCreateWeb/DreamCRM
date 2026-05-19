import 'server-only'
import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'

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

export const AudienceInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  filter: AudienceFilter.default({}),
})

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
      filter: data.filter,
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
  const [row] = await db
    .update(schema.audiences)
    .set({ ...input, updatedAt: new Date() })
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
 * Materialize an audience filter into the actual list of recipient rows. Used
 * by both the audience preview UI and the campaign send path. Always excludes
 * opted-out and archived rows unless filter.includeOptedOut is set.
 */
export async function resolveAudience(
  organizationId: string,
  filter: AudienceFilterT,
) {
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
  return db
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      email: schema.customers.email,
      pipelineStage: schema.customers.pipelineStage,
    })
    .from(schema.customers)
    .where(and(...where))
}
