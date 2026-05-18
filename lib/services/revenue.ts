import 'server-only'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { stripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { clinicProfile, agencyProject, AGENCY_PROJECT_TYPE_LABELS, type AgencyProjectType } from '@/lib/db/schema/platform'

// Postgres "missing" + Stripe "auth failed / not configured" — both degrade
// gracefully so the page never hard-crashes if the DB / Stripe isn't ready.
function isMissingSchema(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (err as { cause?: { code?: string } } | null)?.cause?.code
  if (code === '42P01' || code === '42703') return true
  const msg = err instanceof Error ? err.message : String(err)
  return /relation .* does not exist|column .* does not exist/i.test(msg)
}
function isStripeUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  // Lazy proxy throws when STRIPE_SECRET_KEY isn't set; Stripe SDK throws
  // StripeAuthenticationError when the key is bad.
  return /STRIPE_SECRET_KEY|Stripe(Authentication|Connection)Error|fetch failed/i.test(msg)
}

interface Bucket {
  bucket: string // ISO date for week start
  value: number // cents
}

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  const dow = out.getDay()
  out.setDate(out.getDate() + (dow === 0 ? -6 : 1 - dow))
  return out
}

function weekBuckets(weeks: number): { iso: string[]; earliest: Date } {
  const cursor = startOfWeek(new Date())
  const iso: string[] = []
  for (let i = 0; i < weeks; i++) {
    iso.unshift(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() - 7)
  }
  return { iso, earliest: cursor }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe — paid invoices grouped by week
// ─────────────────────────────────────────────────────────────────────────────

export interface StripeRevenueWindow {
  /** Stripe invoices flagged as paid, with amount in cents. */
  totalCents: number
  paidInvoiceCount: number
  /** Weekly buckets for charting; oldest → newest. */
  buckets: Bucket[]
  /** True when the Stripe client could not be reached / authed. UI shows fallback. */
  stripeUnavailable: boolean
}

/**
 * Fetches paid Stripe invoices in the trailing N weeks and buckets them by week.
 * Iterates with pagination up to a reasonable cap (1000 invoices) so a busy
 * production account doesn't crater the page load.
 */
export async function getStripeRevenueWindow(weeks = 12): Promise<StripeRevenueWindow> {
  const { iso, earliest } = weekBuckets(weeks)
  const since = Math.floor(earliest.getTime() / 1000)
  const buckets: Bucket[] = iso.map((b) => ({ bucket: b, value: 0 }))
  const bucketIdx = new Map<string, number>(iso.map((b, i) => [b, i]))

  let totalCents = 0
  let paidInvoiceCount = 0
  try {
    let startingAfter: string | undefined
    let fetched = 0
    const HARD_CAP = 1000
    while (fetched < HARD_CAP) {
      const page = await stripe.invoices.list({
        status: 'paid',
        created: { gte: since },
        limit: 100,
        starting_after: startingAfter,
      })
      for (const inv of page.data) {
        const paidAt = inv.status_transitions?.paid_at ?? inv.created
        const weekIso = startOfWeek(new Date(paidAt * 1000)).toISOString().slice(0, 10)
        const idx = bucketIdx.get(weekIso)
        if (idx != null) buckets[idx].value += inv.amount_paid
        totalCents += inv.amount_paid
        paidInvoiceCount++
      }
      fetched += page.data.length
      if (!page.has_more || page.data.length === 0) break
      startingAfter = page.data[page.data.length - 1].id
    }
    return { totalCents, paidInvoiceCount, buckets, stripeUnavailable: false }
  } catch (err) {
    if (isStripeUnavailable(err)) {
      return { totalCents: 0, paidInvoiceCount: 0, buckets, stripeUnavailable: true }
    }
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Agency project revenue — completed projects with budgets, bucketed weekly
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectRevenueWindow {
  totalCents: number
  completedCount: number
  buckets: Bucket[]
}

export async function getProjectRevenueWindow(weeks = 12): Promise<ProjectRevenueWindow> {
  try {
    const { iso, earliest } = weekBuckets(weeks)
    const rows = await db
      .select({
        bucket: sql<string>`to_char(date_trunc('week', ${agencyProject.completedAt}), 'YYYY-MM-DD')`,
        sum: sql<number>`coalesce(sum(${agencyProject.budgetCents}), 0)::int`,
        count: sql<number>`count(${agencyProject.id})::int`,
      })
      .from(agencyProject)
      .where(
        and(
          eq(agencyProject.status, 'completed'),
          gte(agencyProject.completedAt, earliest),
        ),
      )
      .groupBy(sql`date_trunc('week', ${agencyProject.completedAt})`)

    const byBucket = new Map(rows.map((r) => [r.bucket, r]))
    const buckets: Bucket[] = iso.map((b) => ({
      bucket: b,
      value: Number(byBucket.get(b)?.sum ?? 0),
    }))

    let totalCents = 0
    let completedCount = 0
    for (const r of rows) {
      totalCents += Number(r.sum)
      completedCount += Number(r.count)
    }
    return { totalCents, completedCount, buckets }
  } catch (err) {
    if (isMissingSchema(err)) {
      return {
        totalCents: 0,
        completedCount: 0,
        buckets: weekBuckets(weeks).iso.map((b) => ({ bucket: b, value: 0 })),
      }
    }
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Outstanding revenue — past-due Stripe + open project budgets
// ─────────────────────────────────────────────────────────────────────────────

export interface OutstandingRevenue {
  pastDueInvoiceCents: number
  pastDueInvoiceCount: number
  openProjectCents: number
  openProjectCount: number
  stripeUnavailable: boolean
}

export async function getOutstandingRevenue(): Promise<OutstandingRevenue> {
  let pastDueInvoiceCents = 0
  let pastDueInvoiceCount = 0
  let stripeUnavailable = false

  try {
    const overdue = await stripe.invoices.list({ status: 'open', limit: 100 })
    for (const inv of overdue.data) {
      pastDueInvoiceCents += inv.amount_remaining
      pastDueInvoiceCount++
    }
  } catch (err) {
    if (isStripeUnavailable(err)) stripeUnavailable = true
    else throw err
  }

  let openProjectCents = 0
  let openProjectCount = 0
  try {
    const [row] = await db
      .select({
        sum: sql<number>`coalesce(sum(${agencyProject.budgetCents}) filter (where ${agencyProject.status} in ('lead','discovery','in_progress','review')), 0)::int`,
        count: sql<number>`count(*) filter (where ${agencyProject.status} in ('lead','discovery','in_progress','review'))::int`,
      })
      .from(agencyProject)
    openProjectCents = Number(row?.sum ?? 0)
    openProjectCount = Number(row?.count ?? 0)
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }

  return {
    pastDueInvoiceCents,
    pastDueInvoiceCount,
    openProjectCents,
    openProjectCount,
    stripeUnavailable,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Top revenue clinics — lifetime paid to Dream Create
// ─────────────────────────────────────────────────────────────────────────────

export interface ClinicRevenueRow {
  clinicId: string | null
  clinicName: string
  slug: string | null
  /** Lifetime subscription revenue (Stripe paid invoices). */
  subscriptionCents: number
  /** Lifetime project revenue (completed agency_project budgets). */
  projectCents: number
  total: number
}

/**
 * Top N clinics ranked by total lifetime revenue. Stripe customer IDs are
 * matched back to clinics via clinic_profile.stripeCustomerId.
 */
export async function getTopRevenueClinics(limit = 5): Promise<{ rows: ClinicRevenueRow[]; stripeUnavailable: boolean }> {
  // Step 1: lifetime paid invoices per Stripe customer
  const byCustomer = new Map<string, number>()
  let stripeUnavailable = false
  try {
    let startingAfter: string | undefined
    let fetched = 0
    const HARD_CAP = 2000
    while (fetched < HARD_CAP) {
      const page = await stripe.invoices.list({
        status: 'paid',
        limit: 100,
        starting_after: startingAfter,
      })
      for (const inv of page.data) {
        const cust = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id
        if (!cust) continue
        byCustomer.set(cust, (byCustomer.get(cust) ?? 0) + inv.amount_paid)
      }
      fetched += page.data.length
      if (!page.has_more || page.data.length === 0) break
      startingAfter = page.data[page.data.length - 1].id
    }
  } catch (err) {
    if (isStripeUnavailable(err)) stripeUnavailable = true
    else throw err
  }

  // Step 2: lifetime project revenue per clinic
  const projectByOrg = new Map<string, number>()
  try {
    const projRows = await db
      .select({
        orgId: agencyProject.organizationId,
        sum: sql<number>`coalesce(sum(${agencyProject.budgetCents}), 0)::int`,
      })
      .from(agencyProject)
      .where(eq(agencyProject.status, 'completed'))
      .groupBy(agencyProject.organizationId)
    for (const r of projRows) {
      if (r.orgId) projectByOrg.set(r.orgId, Number(r.sum))
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }

  // Step 3: pull clinic identities and zip together
  const clinics = await db
    .select({
      orgId: organization.id,
      name: organization.name,
      slug: organization.slug,
      displayName: clinicProfile.displayName,
      stripeCustomerId: clinicProfile.stripeCustomerId,
    })
    .from(organization)
    .leftJoin(clinicProfile, eq(clinicProfile.organizationId, organization.id))
    .where(eq(organization.type, 'clinic'))

  const rows: ClinicRevenueRow[] = clinics.map((c) => {
    const subs = c.stripeCustomerId ? byCustomer.get(c.stripeCustomerId) ?? 0 : 0
    const proj = projectByOrg.get(c.orgId) ?? 0
    return {
      clinicId: c.orgId,
      clinicName: c.displayName ?? c.name,
      slug: c.slug,
      subscriptionCents: subs,
      projectCents: proj,
      total: subs + proj,
    }
  })

  // Include Stripe customers we don't have a clinic record for (rare edge case)
  for (const [custId, total] of Array.from(byCustomer.entries())) {
    if (!clinics.some((c) => c.stripeCustomerId === custId)) {
      rows.push({
        clinicId: null,
        clinicName: `Unlinked Stripe customer (${custId.slice(0, 8)}…)`,
        slug: null,
        subscriptionCents: total,
        projectCents: 0,
        total,
      })
    }
  }

  rows.sort((a, b) => b.total - a.total)
  return { rows: rows.filter((r) => r.total > 0).slice(0, limit), stripeUnavailable }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent transactions — both Stripe paid invoices and completed agency projects
// ─────────────────────────────────────────────────────────────────────────────

export interface RevenueTransaction {
  id: string
  source: 'subscription' | 'project'
  description: string
  clinicName: string | null
  amountCents: number
  occurredAt: Date
  status: string
}

export async function getRecentRevenueTransactions(limit = 15): Promise<{ rows: RevenueTransaction[]; stripeUnavailable: boolean }> {
  const txs: RevenueTransaction[] = []
  let stripeUnavailable = false

  // Stripe paid invoices
  let customerMap = new Map<string, string>()
  try {
    const stripeInvs = await stripe.invoices.list({ status: 'paid', limit: 25 })
    // Resolve customer → clinic name in one DB hop
    const custIds = Array.from(
      new Set(
        stripeInvs.data
          .map((i) => (typeof i.customer === 'string' ? i.customer : i.customer?.id))
          .filter(Boolean) as string[],
      ),
    )
    if (custIds.length) {
      const rows = await db
        .select({
          custId: clinicProfile.stripeCustomerId,
          name: clinicProfile.displayName,
          orgName: organization.name,
        })
        .from(clinicProfile)
        .leftJoin(organization, eq(organization.id, clinicProfile.organizationId))
      customerMap = new Map(
        rows
          .filter((r) => r.custId)
          .map((r) => [r.custId!, (r.name ?? r.orgName ?? '') as string]),
      )
    }
    for (const inv of stripeInvs.data) {
      const cust = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id
      txs.push({
        id: inv.id ?? `inv_${inv.created}`,
        source: 'subscription',
        description: inv.lines.data[0]?.description ?? 'Subscription payment',
        clinicName: cust ? customerMap.get(cust) ?? null : null,
        amountCents: inv.amount_paid,
        occurredAt: new Date((inv.status_transitions?.paid_at ?? inv.created) * 1000),
        status: 'paid',
      })
    }
  } catch (err) {
    if (isStripeUnavailable(err)) stripeUnavailable = true
    else throw err
  }

  // Completed agency projects
  try {
    const projRows = await db
      .select({
        id: agencyProject.id,
        title: agencyProject.title,
        type: agencyProject.type,
        budget: agencyProject.budgetCents,
        completedAt: agencyProject.completedAt,
        clinicName: organization.name,
      })
      .from(agencyProject)
      .leftJoin(organization, eq(organization.id, agencyProject.organizationId))
      .where(eq(agencyProject.status, 'completed'))
      .orderBy(desc(agencyProject.completedAt))
      .limit(limit)

    for (const p of projRows) {
      if (!p.completedAt || !p.budget) continue
      txs.push({
        id: p.id,
        source: 'project',
        description: `${p.title} (${AGENCY_PROJECT_TYPE_LABELS[p.type as AgencyProjectType]})`,
        clinicName: p.clinicName ?? null,
        amountCents: p.budget,
        occurredAt: p.completedAt,
        status: 'completed',
      })
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }

  txs.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
  return { rows: txs.slice(0, limit), stripeUnavailable }
}
