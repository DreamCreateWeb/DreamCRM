import { db } from '@/lib/db'
import { organization, member, user } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'
import { eq, count, gte, and, sql, desc, isNull } from 'drizzle-orm'

export interface MonthPoint { month: string; value: number }
export interface PlanCount { planTier: string; count: number }
export interface StatusCount { status: string; count: number }

export interface ClinicSub {
  id: string
  name: string
  ownerName: string | null
  ownerEmail: string | null
  planTier: string | null
  subscriptionStatus: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  createdAt: Date
  hasProfile: boolean
}

function lastNMonths(n: number): string[] {
  const months: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export async function getClinicCount(): Promise<number> {
  const [{ value }] = await db.select({ value: count() })
    .from(organization).where(eq(organization.type, 'clinic'))
  return Number(value)
}

export async function getActiveSubCount(): Promise<number> {
  const [{ value }] = await db.select({ value: count() })
    .from(clinicProfile)
    .where(sql`${clinicProfile.subscriptionStatus} IN ('active', 'trialing')`)
  return Number(value)
}

export async function getNewClinicCount(days: number): Promise<number> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const [{ value }] = await db.select({ value: count() })
    .from(organization)
    .where(and(eq(organization.type, 'clinic'), gte(organization.createdAt, since)))
  return Number(value)
}

export async function getMRRFromDB(): Promise<number> {
  const prices: Record<string, number> = { basic: 99, pro: 149, premium: 199 }
  const rows = await db
    .select({ planTier: clinicProfile.planTier, n: count() })
    .from(clinicProfile)
    .where(sql`${clinicProfile.subscriptionStatus} IN ('active', 'trialing')`)
    .groupBy(clinicProfile.planTier)
  return rows.reduce((sum, r) => sum + Number(r.n) * (prices[r.planTier ?? 'basic'] ?? 99), 0)
}

export async function getPlanCounts(): Promise<PlanCount[]> {
  const rows = await db
    .select({ planTier: clinicProfile.planTier, n: count() })
    .from(clinicProfile)
    .groupBy(clinicProfile.planTier)
  return rows.map(r => ({ planTier: r.planTier ?? 'basic', count: Number(r.n) }))
}

export async function getStatusCounts(): Promise<StatusCount[]> {
  const rows = await db
    .select({ status: clinicProfile.subscriptionStatus, n: count() })
    .from(clinicProfile)
    .groupBy(clinicProfile.subscriptionStatus)
  return rows.map(r => ({ status: r.status ?? 'none', count: Number(r.n) }))
}

export async function getOnboardingCount(): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(organization)
    .leftJoin(clinicProfile, eq(clinicProfile.organizationId, organization.id))
    .where(and(eq(organization.type, 'clinic'), isNull(clinicProfile.organizationId)))
  return Number(value)
}

export async function getMonthlySignups(numMonths = 6): Promise<MonthPoint[]> {
  const since = new Date()
  since.setMonth(since.getMonth() - numMonths)
  since.setDate(1)

  const rows = await db
    .select({
      month: sql<string>`TO_CHAR(${organization.createdAt}, 'YYYY-MM')`,
      n: count(),
    })
    .from(organization)
    .where(and(eq(organization.type, 'clinic'), gte(organization.createdAt, since)))
    .groupBy(sql`TO_CHAR(${organization.createdAt}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${organization.createdAt}, 'YYYY-MM')`)

  const map = Object.fromEntries(rows.map(r => [r.month, Number(r.n)]))
  return lastNMonths(numMonths).map(m => ({ month: m, value: map[m] ?? 0 }))
}

export async function getRecentClinics(limit = 6) {
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      createdAt: organization.createdAt,
      planTier: clinicProfile.planTier,
      subscriptionStatus: clinicProfile.subscriptionStatus,
    })
    .from(organization)
    .leftJoin(clinicProfile, eq(clinicProfile.organizationId, organization.id))
    .where(eq(organization.type, 'clinic'))
    .orderBy(desc(organization.createdAt))
    .limit(limit)

  const results = []
  for (const row of rows) {
    const [owner] = await db
      .select({ name: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, row.id))
      .limit(1)
    results.push({ ...row, ownerName: owner?.name ?? null, ownerEmail: owner?.email ?? null })
  }
  return results
}

export async function getAllClinicSubs(): Promise<ClinicSub[]> {
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      createdAt: organization.createdAt,
      planTier: clinicProfile.planTier,
      subscriptionStatus: clinicProfile.subscriptionStatus,
      stripeCustomerId: clinicProfile.stripeCustomerId,
      stripeSubscriptionId: clinicProfile.stripeSubscriptionId,
      hasProfile: sql<boolean>`${clinicProfile.organizationId} IS NOT NULL`,
    })
    .from(organization)
    .leftJoin(clinicProfile, eq(clinicProfile.organizationId, organization.id))
    .where(eq(organization.type, 'clinic'))
    .orderBy(desc(organization.createdAt))

  const results: ClinicSub[] = []
  for (const row of rows) {
    const [owner] = await db
      .select({ name: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, row.id))
      .limit(1)
    results.push({ ...row, ownerName: owner?.name ?? null, ownerEmail: owner?.email ?? null })
  }
  return results
}
