import 'server-only'
import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { clinicProfile, agencyProject } from '@/lib/db/schema/platform'
import { patient, appointment } from '@/lib/db/schema/clinic'

const TIER_PRICES_CENTS = { basic: 9900, pro: 14900, premium: 19900 } as const

// "Already missing" Postgres error codes — return zero state instead of crashing
// when migrations haven't run yet on a fresh environment.
function isMissingSchema(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (err as { cause?: { code?: string } } | null)?.cause?.code
  if (code === '42P01' || code === '42703') return true
  const msg = err instanceof Error ? err.message : String(err)
  return /relation .* does not exist|column .* does not exist/i.test(msg)
}

// ─────────────────────────────────────────────────────────────────────────────
// Time series buckets — small helpers shared by every trend query.
// ─────────────────────────────────────────────────────────────────────────────

interface Bucket {
  /** ISO date for the start of the bucket (e.g. '2026-05-12' for the Mon of that week). */
  bucket: string
  value: number
}

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  const day = out.getDay() // 0=Sun
  const offset = day === 0 ? -6 : 1 - day
  out.setDate(out.getDate() + offset)
  return out
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function weeksBack(n: number): { from: Date; bucketIso: string[] } {
  const now = new Date()
  const cursor = startOfWeek(now)
  const bucketIso: string[] = []
  for (let i = 0; i < n; i++) {
    bucketIso.unshift(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() - 7)
  }
  return { from: cursor /* one before earliest */, bucketIso }
}

function monthsBack(n: number): { from: Date; bucketIso: string[] } {
  const now = new Date()
  const cursor = startOfMonth(now)
  const bucketIso: string[] = []
  for (let i = 0; i < n; i++) {
    bucketIso.unshift(cursor.toISOString().slice(0, 10))
    cursor.setMonth(cursor.getMonth() - 1)
  }
  return { from: cursor, bucketIso }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinic growth — new signups per week
// ─────────────────────────────────────────────────────────────────────────────

export interface ClinicGrowth {
  buckets: Bucket[]
  total: number
  newThisWeek: number
  newPrevWeek: number
  pctChange: number | null
}

export async function getClinicGrowth(weeks = 12): Promise<ClinicGrowth> {
  try {
    const { bucketIso } = weeksBack(weeks)
    const earliest = new Date(bucketIso[0])

    const rows = await db
      .select({
        bucket: sql<string>`to_char(date_trunc('week', ${organization.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(${organization.id})::int`,
      })
      .from(organization)
      .where(and(eq(organization.type, 'clinic'), gte(organization.createdAt, earliest)))
      .groupBy(sql`date_trunc('week', ${organization.createdAt})`)

    const counts = new Map<string, number>(rows.map((r) => [r.bucket, Number(r.count)]))
    const buckets: Bucket[] = bucketIso.map((iso) => ({ bucket: iso, value: counts.get(iso) ?? 0 }))

    const [totalRow] = await db
      .select({ count: sql<number>`count(${organization.id})::int` })
      .from(organization)
      .where(eq(organization.type, 'clinic'))

    const newThisWeek = buckets[buckets.length - 1]?.value ?? 0
    const newPrevWeek = buckets[buckets.length - 2]?.value ?? 0
    const pctChange =
      newPrevWeek === 0 ? (newThisWeek > 0 ? 100 : null) : ((newThisWeek - newPrevWeek) / newPrevWeek) * 100

    return { buckets, total: totalRow?.count ?? 0, newThisWeek, newPrevWeek, pctChange }
  } catch (err) {
    if (isMissingSchema(err)) {
      return { buckets: [], total: 0, newThisWeek: 0, newPrevWeek: 0, pctChange: null }
    }
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MRR — current snapshot + tier mix
//
// We don't yet persist subscription history, so the "trend" is approximated:
// for each historical week we count clinics whose subscription was active at
// the time (clinic_profile.created_at <= week start AND
// subscriptionStatus in ('active','trialing') OR cancelled after the week).
// This is a fair approximation while we have just the current snapshot.
// When a `subscription_event` audit table lands later we'll swap this for
// a proper time-window query.
// ─────────────────────────────────────────────────────────────────────────────

export interface MrrSnapshot {
  activeClinics: number
  byTier: { basic: number; pro: number; premium: number }
  monthlyRecurringCents: number
  annualRunRateCents: number
  arpu: number
}

export async function getMrrSnapshot(): Promise<MrrSnapshot> {
  try {
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

    return {
      activeClinics,
      byTier,
      monthlyRecurringCents,
      annualRunRateCents: monthlyRecurringCents * 12,
      arpu: activeClinics === 0 ? 0 : Math.round(monthlyRecurringCents / activeClinics),
    }
  } catch (err) {
    if (isMissingSchema(err)) {
      return { activeClinics: 0, byTier: { basic: 0, pro: 0, premium: 0 }, monthlyRecurringCents: 0, annualRunRateCents: 0, arpu: 0 }
    }
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Churn — subscriptions canceled in the last 30 days
// ─────────────────────────────────────────────────────────────────────────────

export interface ChurnStats {
  canceled30d: number
  pastDue: number
  // Approximation: active 30 days ago = current active + canceled in window.
  // True churn rate query requires a subscription_event log we don't have yet.
  approxChurnRate30d: number
}

export async function getChurnStats(): Promise<ChurnStats> {
  try {
    const since30 = new Date(Date.now() - 30 * 86_400_000)

    const [canceled] = await db
      .select({ count: sql<number>`count(${clinicProfile.organizationId})::int` })
      .from(clinicProfile)
      .where(
        and(
          eq(clinicProfile.subscriptionStatus, 'canceled'),
          gte(clinicProfile.updatedAt, since30),
        ),
      )

    const [pastDue] = await db
      .select({ count: sql<number>`count(${clinicProfile.organizationId})::int` })
      .from(clinicProfile)
      .where(sql`${clinicProfile.subscriptionStatus} in ('past_due','unpaid','incomplete_expired')`)

    const [activeRow] = await db
      .select({ count: sql<number>`count(${clinicProfile.organizationId})::int` })
      .from(clinicProfile)
      .where(sql`${clinicProfile.subscriptionStatus} in ('active','trialing')`)

    const active = activeRow?.count ?? 0
    const cancel = canceled?.count ?? 0
    const cohortStart = active + cancel
    const approxChurnRate30d = cohortStart === 0 ? 0 : (cancel / cohortStart) * 100

    return { canceled30d: cancel, pastDue: pastDue?.count ?? 0, approxChurnRate30d }
  } catch (err) {
    if (isMissingSchema(err)) {
      return { canceled30d: 0, pastDue: 0, approxChurnRate30d: 0 }
    }
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Project velocity — completed per month over last N months
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectVelocity {
  buckets: Bucket[]
  completedLastMonth: number
  completedThisMonth: number
  pctChange: number | null
  avgDurationDays: number | null
}

export async function getProjectVelocity(months = 6): Promise<ProjectVelocity> {
  try {
    const { bucketIso } = monthsBack(months)
    const earliest = new Date(bucketIso[0])

    const rows = await db
      .select({
        bucket: sql<string>`to_char(date_trunc('month', ${agencyProject.completedAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(${agencyProject.id})::int`,
      })
      .from(agencyProject)
      .where(
        and(
          eq(agencyProject.status, 'completed'),
          gte(agencyProject.completedAt, earliest),
        ),
      )
      .groupBy(sql`date_trunc('month', ${agencyProject.completedAt})`)

    const counts = new Map<string, number>(rows.map((r) => [r.bucket, Number(r.count)]))
    const buckets: Bucket[] = bucketIso.map((iso) => ({ bucket: iso, value: counts.get(iso) ?? 0 }))

    const completedThisMonth = buckets[buckets.length - 1]?.value ?? 0
    const completedLastMonth = buckets[buckets.length - 2]?.value ?? 0
    const pctChange =
      completedLastMonth === 0
        ? (completedThisMonth > 0 ? 100 : null)
        : ((completedThisMonth - completedLastMonth) / completedLastMonth) * 100

    // Average duration: how long open → completed took, expressed in days.
    const [duration] = await db
      .select({
        avg: sql<number>`coalesce(avg(extract(epoch from (${agencyProject.completedAt} - ${agencyProject.startedAt})) / 86400), 0)::float`,
      })
      .from(agencyProject)
      .where(
        and(
          eq(agencyProject.status, 'completed'),
          sql`${agencyProject.startedAt} is not null`,
          sql`${agencyProject.completedAt} is not null`,
        ),
      )

    const avgDurationDays = duration?.avg ? Math.round(Number(duration.avg)) : null

    return { buckets, completedThisMonth, completedLastMonth, pctChange, avgDurationDays }
  } catch (err) {
    if (isMissingSchema(err)) {
      return { buckets: [], completedThisMonth: 0, completedLastMonth: 0, pctChange: null, avgDurationDays: null }
    }
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Project funnel — current pipeline conversion
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectFunnel {
  totalCreated: number
  reachedDiscovery: number
  reachedInProgress: number
  reachedReview: number
  reachedCompleted: number
  /** Created → completed, computed on lifetime data so single-step rates make sense. */
  overallCompletionRate: number
  /** Lost (cancelled + on_hold) as percentage of created. */
  lossRate: number
}

export async function getProjectFunnel(): Promise<ProjectFunnel> {
  try {
    const [totals] = await db
      .select({
        total: sql<number>`count(${agencyProject.id})::int`,
        completed: sql<number>`count(*) filter (where ${agencyProject.status} = 'completed')::int`,
        cancelled: sql<number>`count(*) filter (where ${agencyProject.status} in ('cancelled','on_hold'))::int`,
        // Cumulative funnel: anything that ever made it to status X or beyond.
        // Approximated by current status — once a project is 'review' we know
        // it was 'in_progress' at some point. Until we add an event log this
        // is the best we can do.
        atDiscovery: sql<number>`count(*) filter (where ${agencyProject.status} in ('discovery','in_progress','review','completed'))::int`,
        atInProgress: sql<number>`count(*) filter (where ${agencyProject.status} in ('in_progress','review','completed'))::int`,
        atReview: sql<number>`count(*) filter (where ${agencyProject.status} in ('review','completed'))::int`,
      })
      .from(agencyProject)

    const total = totals?.total ?? 0
    const completed = totals?.completed ?? 0
    const cancelled = totals?.cancelled ?? 0

    return {
      totalCreated: total,
      reachedDiscovery: totals?.atDiscovery ?? 0,
      reachedInProgress: totals?.atInProgress ?? 0,
      reachedReview: totals?.atReview ?? 0,
      reachedCompleted: completed,
      overallCompletionRate: total === 0 ? 0 : (completed / total) * 100,
      lossRate: total === 0 ? 0 : (cancelled / total) * 100,
    }
  } catch (err) {
    if (isMissingSchema(err)) {
      return { totalCreated: 0, reachedDiscovery: 0, reachedInProgress: 0, reachedReview: 0, reachedCompleted: 0, overallCompletionRate: 0, lossRate: 0 }
    }
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate platform engagement — patient + appointment volume across all clinics
// ─────────────────────────────────────────────────────────────────────────────

export interface PlatformEngagement {
  totalPatients: number
  newPatients30d: number
  appointmentsBooked30d: number
  appointmentsBooked7d: number
}

export async function getPlatformEngagement(): Promise<PlatformEngagement> {
  try {
    const since30 = new Date(Date.now() - 30 * 86_400_000)
    const since7 = new Date(Date.now() - 7 * 86_400_000)

    const [totalPat] = await db
      .select({ count: sql<number>`count(${patient.id})::int` })
      .from(patient)

    const [newPat] = await db
      .select({ count: sql<number>`count(${patient.id})::int` })
      .from(patient)
      .where(gte(patient.createdAt, since30))

    const [appt30] = await db
      .select({ count: sql<number>`count(${appointment.id})::int` })
      .from(appointment)
      .where(gte(appointment.createdAt, since30))

    const [appt7] = await db
      .select({ count: sql<number>`count(${appointment.id})::int` })
      .from(appointment)
      .where(gte(appointment.createdAt, since7))

    return {
      totalPatients: totalPat?.count ?? 0,
      newPatients30d: newPat?.count ?? 0,
      appointmentsBooked30d: appt30?.count ?? 0,
      appointmentsBooked7d: appt7?.count ?? 0,
    }
  } catch (err) {
    if (isMissingSchema(err)) {
      return { totalPatients: 0, newPatients30d: 0, appointmentsBooked30d: 0, appointmentsBooked7d: 0 }
    }
    throw err
  }
}
