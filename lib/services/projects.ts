import 'server-only'
import { randomUUID } from 'crypto'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  agencyProject,
  AGENCY_PROJECT_TYPES,
  AGENCY_PROJECT_STATUSES,
  type AgencyProject,
  type AgencyProjectStatus,
  type AgencyProjectType,
} from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'

const OPEN_STATUSES: AgencyProjectStatus[] = ['lead', 'discovery', 'in_progress', 'review']

export interface ProjectInput {
  organizationId?: string | null
  type: AgencyProjectType
  title: string
  description?: string | null
  status?: AgencyProjectStatus
  budgetCents?: number | null
  dueDate?: Date | null
  ownerUserId?: string | null
}

function sanitizeType(value: unknown): AgencyProjectType {
  return AGENCY_PROJECT_TYPES.includes(value as AgencyProjectType)
    ? (value as AgencyProjectType)
    : 'other'
}
function sanitizeStatus(value: unknown): AgencyProjectStatus {
  return AGENCY_PROJECT_STATUSES.includes(value as AgencyProjectStatus)
    ? (value as AgencyProjectStatus)
    : 'lead'
}

export async function createProject(input: ProjectInput): Promise<AgencyProject> {
  const title = input.title.trim()
  if (!title) throw new Error('Title is required')
  const type = sanitizeType(input.type)
  const status = sanitizeStatus(input.status ?? 'lead')

  const [row] = await db
    .insert(agencyProject)
    .values({
      id: randomUUID(),
      organizationId: input.organizationId ?? null,
      type,
      title,
      description: input.description?.trim() || null,
      status,
      budgetCents: input.budgetCents ?? null,
      dueDate: input.dueDate ?? null,
      ownerUserId: input.ownerUserId ?? null,
      startedAt: status === 'in_progress' || status === 'review' ? new Date() : null,
      completedAt: status === 'completed' ? new Date() : null,
    })
    .returning()
  return row
}

export async function updateProject(id: string, patch: Partial<ProjectInput>): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.title !== undefined) set.title = patch.title.trim()
  if (patch.description !== undefined) set.description = patch.description?.trim() || null
  if (patch.type !== undefined) set.type = sanitizeType(patch.type)
  if (patch.status !== undefined) {
    const next = sanitizeStatus(patch.status)
    set.status = next
    if (next === 'in_progress' || next === 'review') set.startedAt = sql`coalesce(${agencyProject.startedAt}, now())`
    if (next === 'completed') set.completedAt = new Date()
    if (next !== 'completed') set.completedAt = null
  }
  if (patch.budgetCents !== undefined) set.budgetCents = patch.budgetCents
  if (patch.dueDate !== undefined) set.dueDate = patch.dueDate
  if (patch.ownerUserId !== undefined) set.ownerUserId = patch.ownerUserId
  if (patch.organizationId !== undefined) set.organizationId = patch.organizationId

  await db.update(agencyProject).set(set).where(eq(agencyProject.id, id))
}

export async function deleteProject(id: string): Promise<void> {
  await db.delete(agencyProject).where(eq(agencyProject.id, id))
}

export async function listAllProjects() {
  const rows = await db
    .select({
      project: agencyProject,
      clinicName: organization.name,
      clinicSlug: organization.slug,
    })
    .from(agencyProject)
    .leftJoin(organization, eq(organization.id, agencyProject.organizationId))
    .orderBy(desc(agencyProject.updatedAt))
  return rows
}

export async function listProjectsForOrg(organizationId: string) {
  return db
    .select()
    .from(agencyProject)
    .where(eq(agencyProject.organizationId, organizationId))
    .orderBy(desc(agencyProject.updatedAt))
}

export async function listActiveProjectsForOrg(organizationId: string) {
  try {
    return await db
      .select()
      .from(agencyProject)
      .where(
        and(
          eq(agencyProject.organizationId, organizationId),
          inArray(agencyProject.status, OPEN_STATUSES),
        ),
      )
      .orderBy(desc(agencyProject.updatedAt))
  } catch (err) {
    if (isMissingSchemaError(err)) {
      console.warn('[projects] agency_project table missing — apply migration 0002')
      return []
    }
    throw err
  }
}

export interface ProjectStats {
  totalProjects: number
  openProjects: number
  completedThisMonth: number
  byStatus: Record<AgencyProjectStatus, number>
  byType: Record<AgencyProjectType, number>
  pipelineValueCents: number
  completedValueCents: number
  recentlyUpdated: Array<{ id: string; title: string; type: string; status: string; clinicName: string | null; updatedAt: Date }>
}

// Postgres reports "relation does not exist" as code 42P01 and missing column
// as 42703. Treat both as "migration pending" — degrade gracefully instead of
// crashing the page, so a deploy that lands before the migration runs is
// recoverable from the UI side.
function isMissingSchemaError(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (err as { cause?: { code?: string } } | null)?.cause?.code
  if (code === '42P01' || code === '42703') return true
  const msg = err instanceof Error ? err.message : String(err)
  return /relation .* does not exist|column .* does not exist/i.test(msg)
}

function emptyProjectStats(): ProjectStats {
  return {
    totalProjects: 0,
    openProjects: 0,
    completedThisMonth: 0,
    byStatus: Object.fromEntries(AGENCY_PROJECT_STATUSES.map((s) => [s, 0] as const)) as Record<
      AgencyProjectStatus,
      number
    >,
    byType: Object.fromEntries(AGENCY_PROJECT_TYPES.map((t) => [t, 0] as const)) as Record<
      AgencyProjectType,
      number
    >,
    pipelineValueCents: 0,
    completedValueCents: 0,
    recentlyUpdated: [],
  }
}

export async function getProjectStats(): Promise<ProjectStats> {
  try {
    return await getProjectStatsRaw()
  } catch (err) {
    if (isMissingSchemaError(err)) {
      console.warn('[projects] agency_project table missing — apply migration 0002')
      return emptyProjectStats()
    }
    throw err
  }
}

async function getProjectStatsRaw(): Promise<ProjectStats> {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [totals] = await db
    .select({
      total: sql<number>`count(${agencyProject.id})::int`,
      open: sql<number>`count(*) filter (where ${agencyProject.status} in ('lead','discovery','in_progress','review'))::int`,
      completedMonth: sql<number>`count(*) filter (where ${agencyProject.status} = 'completed' and ${agencyProject.completedAt} >= ${monthStart})::int`,
      pipelineValue: sql<number>`coalesce(sum(${agencyProject.budgetCents}) filter (where ${agencyProject.status} in ('lead','discovery','in_progress','review')), 0)::int`,
      completedValue: sql<number>`coalesce(sum(${agencyProject.budgetCents}) filter (where ${agencyProject.status} = 'completed'), 0)::int`,
    })
    .from(agencyProject)

  const statusRows = await db
    .select({
      status: agencyProject.status,
      count: sql<number>`count(${agencyProject.id})::int`,
    })
    .from(agencyProject)
    .groupBy(agencyProject.status)

  const typeRows = await db
    .select({
      type: agencyProject.type,
      count: sql<number>`count(${agencyProject.id})::int`,
    })
    .from(agencyProject)
    .groupBy(agencyProject.type)

  const recentRows = await db
    .select({
      id: agencyProject.id,
      title: agencyProject.title,
      type: agencyProject.type,
      status: agencyProject.status,
      updatedAt: agencyProject.updatedAt,
      clinicName: organization.name,
    })
    .from(agencyProject)
    .leftJoin(organization, eq(organization.id, agencyProject.organizationId))
    .orderBy(desc(agencyProject.updatedAt))
    .limit(8)

  const byStatus = Object.fromEntries(
    AGENCY_PROJECT_STATUSES.map((s) => [s, 0] as const),
  ) as Record<AgencyProjectStatus, number>
  for (const row of statusRows) byStatus[row.status as AgencyProjectStatus] = row.count

  const byType = Object.fromEntries(
    AGENCY_PROJECT_TYPES.map((t) => [t, 0] as const),
  ) as Record<AgencyProjectType, number>
  for (const row of typeRows) byType[row.type as AgencyProjectType] = row.count

  return {
    totalProjects: totals?.total ?? 0,
    openProjects: totals?.open ?? 0,
    completedThisMonth: totals?.completedMonth ?? 0,
    byStatus,
    byType,
    pipelineValueCents: totals?.pipelineValue ?? 0,
    completedValueCents: totals?.completedValue ?? 0,
    recentlyUpdated: recentRows,
  }
}

/**
 * Recurring revenue + clinic count snapshot — what Dream Create earns from
 * subscriptions, separate from project work.
 */
export interface SubscriptionStats {
  activeClinics: number
  byTier: { basic: number; pro: number; premium: number }
  monthlyRecurringCents: number
  newClinics30d: number
}

const TIER_PRICES_CENTS = { basic: 9900, pro: 14900, premium: 19900 } as const

export async function getSubscriptionStats(): Promise<SubscriptionStats> {
  try {
    return await getSubscriptionStatsRaw()
  } catch (err) {
    if (isMissingSchemaError(err)) {
      console.warn('[projects] clinic_profile or organization columns missing')
      return { activeClinics: 0, byTier: { basic: 0, pro: 0, premium: 0 }, monthlyRecurringCents: 0, newClinics30d: 0 }
    }
    throw err
  }
}

async function getSubscriptionStatsRaw(): Promise<SubscriptionStats> {
  const { clinicProfile } = await import('@/lib/db/schema/platform')

  // Count clinics with an active subscription, grouped by plan tier
  const rows = await db
    .select({
      planTier: clinicProfile.planTier,
      count: sql<number>`count(${clinicProfile.organizationId})::int`,
    })
    .from(clinicProfile)
    .where(sql`${clinicProfile.subscriptionStatus} in ('active','trialing')`)
    .groupBy(clinicProfile.planTier)

  const byTier = { basic: 0, pro: 0, premium: 0 }
  for (const r of rows) {
    if (r.planTier === 'basic') byTier.basic = r.count
    else if (r.planTier === 'pro') byTier.pro = r.count
    else if (r.planTier === 'premium') byTier.premium = r.count
  }

  const activeClinics = byTier.basic + byTier.pro + byTier.premium
  const monthlyRecurringCents =
    byTier.basic * TIER_PRICES_CENTS.basic +
    byTier.pro * TIER_PRICES_CENTS.pro +
    byTier.premium * TIER_PRICES_CENTS.premium

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [newCount] = await db
    .select({ count: sql<number>`count(${organization.id})::int` })
    .from(organization)
    .where(and(eq(organization.type, 'clinic'), gte(organization.createdAt, since30)))

  return {
    activeClinics,
    byTier,
    monthlyRecurringCents,
    newClinics30d: newCount?.count ?? 0,
  }
}
