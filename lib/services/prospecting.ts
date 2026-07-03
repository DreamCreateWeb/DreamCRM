import 'server-only'
import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import {
  resolveProspectingConfig,
  type ProspectingConfig,
  type ProspectFilters,
  type ProspectFunnelStats,
  type ProspectListRow,
} from '@/lib/types/prospecting'
import { stateZip3Prefixes } from '@/lib/types/us-geo'

/**
 * Prospecting core — Dream Create's own outbound growth engine. Queries,
 * config, and metering for the platform-global prospect tables. Every
 * caller is a requirePlatformAdmin() server action or a CRON_SECRET cron;
 * these tables are platform-operator data, not tenant data (see the schema
 * header for the scoping rationale).
 */

// ── Config (singleton row, resolve-with-defaults) ──────────────────────────

export async function getProspectingConfig(): Promise<ProspectingConfig> {
  const [row] = await db
    .select({ config: schema.prospectingConfig.config })
    .from(schema.prospectingConfig)
    .where(eq(schema.prospectingConfig.id, 'default'))
    .limit(1)
  return resolveProspectingConfig(row?.config ?? null)
}

export async function updateProspectingConfig(
  patch: Partial<ProspectingConfig>,
): Promise<ProspectingConfig> {
  const current = await getProspectingConfig()
  const next: ProspectingConfig = resolveProspectingConfig({ ...current, ...patch })
  await db
    .insert(schema.prospectingConfig)
    .values({ id: 'default', config: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.prospectingConfig.id,
      set: { config: next, updatedAt: new Date() },
    })
  // Newly enabled states get their discovery tasks seeded immediately.
  for (const state of next.enabledStates) {
    if (!current.enabledStates.includes(state)) await seedDiscoveryTasks(state)
  }
  return next
}

// ── Counters (platform-global metering) ────────────────────────────────────

/** 'YYYY-MM' for monthly budgets. */
export function counterMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7)
}
/** 'YYYY-MM-DD' for the daily send cap. */
export function counterDay(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export async function bumpProspectingCounter(
  period: string,
  kind: string,
  by = 1,
): Promise<void> {
  await db
    .insert(schema.prospectingCounter)
    .values({ id: newId('pctr'), period, kind, count: by, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.prospectingCounter.period, schema.prospectingCounter.kind],
      set: {
        count: sql`${schema.prospectingCounter.count} + ${by}`,
        updatedAt: new Date(),
      },
    })
}

export async function getProspectingCounter(period: string, kind: string): Promise<number> {
  const [row] = await db
    .select({ count: schema.prospectingCounter.count })
    .from(schema.prospectingCounter)
    .where(
      and(
        eq(schema.prospectingCounter.period, period),
        eq(schema.prospectingCounter.kind, kind),
      ),
    )
    .limit(1)
  return row?.count ?? 0
}

// ── Discovery task seeding ─────────────────────────────────────────────────

/** Seed the state's zip3 task grid (idempotent — conflict rows skipped). */
export async function seedDiscoveryTasks(state: string): Promise<number> {
  const prefixes = stateZip3Prefixes(state)
  if (prefixes.length === 0) return 0
  const rows = prefixes.map((zipPrefix) => ({
    id: newId('pdt'),
    state,
    zipPrefix,
    status: 'pending' as const,
  }))
  await db.insert(schema.prospectDiscoveryTask).values(rows).onConflictDoNothing()
  return rows.length
}

// ── Prospect queries ───────────────────────────────────────────────────────

const LIST_PAGE_SIZE = 50

export async function listProspects(
  filters: ProspectFilters,
  page = 1,
): Promise<{ rows: ProspectListRow[]; total: number; pageSize: number }> {
  const conds = []
  if (filters.state) conds.push(eq(schema.prospect.state, filters.state))
  if (filters.status) conds.push(eq(schema.prospect.status, filters.status))
  if (filters.scoreBand) conds.push(eq(schema.prospect.scoreBand, filters.scoreBand))
  if (filters.hasWebsite === true) conds.push(isNotNull(schema.prospect.websiteUrl))
  if (filters.hasWebsite === false) conds.push(isNull(schema.prospect.websiteUrl))
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    conds.push(
      or(
        ilike(schema.prospect.name, q),
        ilike(schema.prospect.city, q),
        ilike(schema.prospect.authorizedOfficialName, q),
      ),
    )
  }
  const where = conds.length ? and(...conds) : undefined

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.prospect)
    .where(where)

  const rows = await db
    .select({
      id: schema.prospect.id,
      name: schema.prospect.name,
      city: schema.prospect.city,
      state: schema.prospect.state,
      phone: schema.prospect.phone,
      email: schema.prospect.email,
      websiteUrl: schema.prospect.websiteUrl,
      googleRatingTenths: schema.prospect.googleRatingTenths,
      reviewCount: schema.prospect.reviewCount,
      status: schema.prospect.status,
      scoreBand: schema.prospect.scoreBand,
      opportunityScore: schema.prospect.opportunityScore,
      intentSignal: schema.prospect.intentSignal,
      intentAt: schema.prospect.intentAt,
      authorizedOfficialName: schema.prospect.authorizedOfficialName,
      createdAt: schema.prospect.createdAt,
    })
    .from(schema.prospect)
    .where(where)
    .orderBy(
      // Hottest opportunities first, then freshest.
      sql`${schema.prospect.opportunityScore} DESC NULLS LAST`,
      desc(schema.prospect.createdAt),
    )
    .limit(LIST_PAGE_SIZE)
    .offset((Math.max(1, page) - 1) * LIST_PAGE_SIZE)

  return {
    rows: rows as ProspectListRow[],
    total: total ?? 0,
    pageSize: LIST_PAGE_SIZE,
  }
}

export async function getFunnelStats(): Promise<ProspectFunnelStats> {
  const rows = await db
    .select({ status: schema.prospect.status, n: sql<number>`count(*)::int` })
    .from(schema.prospect)
    .groupBy(schema.prospect.status)
  const by = new Map(rows.map((r) => [r.status, r.n]))
  const sum = (statuses: string[]) => statuses.reduce((acc, s) => acc + (by.get(s) ?? 0), 0)
  // Funnel stages are cumulative-forward: a converted prospect still counts
  // as having been discovered/enriched/contacted.
  const converted = sum(['converted'])
  const callList = sum(['call_list']) + converted
  const engaged = sum(['engaged']) + callList
  const contacted = sum(['contacted', 'not_interested', 'suppressed']) + engaged
  const enriched = sum(['enriched', 'queued']) + contacted
  const discovered = sum(['discovered', 'enriching', 'disqualified']) + enriched
  return { discovered, enriched, contacted, engaged, callList, converted }
}

export async function getDiscoveryProgress(): Promise<
  Array<{ state: string; pending: number; done: number; error: number; imported: number }>
> {
  const rows = await db
    .select({
      state: schema.prospectDiscoveryTask.state,
      status: schema.prospectDiscoveryTask.status,
      n: sql<number>`count(*)::int`,
      imported: sql<number>`coalesce(sum(${schema.prospectDiscoveryTask.imported}), 0)::int`,
    })
    .from(schema.prospectDiscoveryTask)
    .groupBy(schema.prospectDiscoveryTask.state, schema.prospectDiscoveryTask.status)
  const byState = new Map<
    string,
    { state: string; pending: number; done: number; error: number; imported: number }
  >()
  for (const r of rows) {
    const entry =
      byState.get(r.state) ?? { state: r.state, pending: 0, done: 0, error: 0, imported: 0 }
    if (r.status === 'done') entry.done += r.n
    else if (r.status === 'error') entry.error += r.n
    else entry.pending += r.n
    entry.imported += r.imported
    byState.set(r.state, entry)
  }
  return Array.from(byState.values()).sort((a, b) => a.state.localeCompare(b.state))
}

// ── Mutations (platform admin actions) ─────────────────────────────────────

export async function suppressProspect(
  prospectId: string,
  reason: string,
): Promise<void> {
  const [row] = await db
    .select({ email: schema.prospect.email })
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  await db
    .update(schema.prospect)
    .set({
      status: 'suppressed',
      suppressedReason: reason,
      suppressedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.prospect.id, prospectId))
  if (row?.email) {
    await db
      .insert(schema.prospectSuppression)
      .values({
        id: newId('psup'),
        email: row.email.toLowerCase(),
        domain: row.email.split('@')[1]?.toLowerCase() ?? null,
        reason: 'manual',
        prospectId,
      })
      .onConflictDoNothing()
  }
  // A live enrollment (if any) stops with the prospect.
  await db
    .update(schema.outreachEnrollment)
    .set({ status: 'stopped_manual', stoppedAt: new Date(), stopReason: reason })
    .where(
      and(
        eq(schema.outreachEnrollment.prospectId, prospectId),
        inArray(schema.outreachEnrollment.status, ['active', 'paused_ooo']),
      ),
    )
}

/**
 * Fail-closed dedupe gate: is this contact already a customer, a known org,
 * or suppressed? ANY match = never enroll / never send.
 */
export async function isKnownContact(input: {
  email?: string | null
  phone?: string | null
  websiteDomain?: string | null
}): Promise<boolean> {
  const email = input.email?.toLowerCase().trim() || null
  const domain = input.websiteDomain?.toLowerCase().replace(/^www\./, '') || null
  const phone = input.phone?.replace(/\D/g, '') || null

  if (email) {
    const [sup] = await db
      .select({ id: schema.prospectSuppression.id })
      .from(schema.prospectSuppression)
      .where(eq(schema.prospectSuppression.email, email))
      .limit(1)
    if (sup) return true
    const [cust] = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(sql`lower(${schema.customers.email}) = ${email}`)
      .limit(1)
    if (cust) return true
    const [clinic] = await db
      .select({ organizationId: schema.clinicProfile.organizationId })
      .from(schema.clinicProfile)
      .where(sql`lower(${schema.clinicProfile.email}) = ${email}`)
      .limit(1)
    if (clinic) return true
  }
  if (domain) {
    const [sup] = await db
      .select({ id: schema.prospectSuppression.id })
      .from(schema.prospectSuppression)
      .where(eq(schema.prospectSuppression.domain, domain))
      .limit(1)
    if (sup) return true
    const [clinic] = await db
      .select({ organizationId: schema.clinicProfile.organizationId })
      .from(schema.clinicProfile)
      .where(
        sql`lower(replace(coalesce(${schema.clinicProfile.websiteDomain}, ''), 'www.', '')) = ${domain}`,
      )
      .limit(1)
    if (clinic) return true
  }
  if (phone) {
    const [clinic] = await db
      .select({ organizationId: schema.clinicProfile.organizationId })
      .from(schema.clinicProfile)
      .where(sql`regexp_replace(coalesce(${schema.clinicProfile.phone}, ''), '\\D', '', 'g') = ${phone}`)
      .limit(1)
    if (clinic) return true
  }
  return false
}
