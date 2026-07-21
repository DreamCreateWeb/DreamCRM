import 'server-only'
import { and, desc, eq, sql } from 'drizzle-orm'
import { stripe } from '@/lib/stripe'
import type Stripe from 'stripe'
import { db } from '@/lib/db'
import { organization, member, user } from '@/lib/db/schema/auth'
import {
  clinicProfile,
  agencyProject,
  type ClinicProfile,
} from '@/lib/db/schema/platform'
import { patient, appointment } from '@/lib/db/schema/clinic'

function isMissingSchema(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (err as { cause?: { code?: string } } | null)?.cause?.code
  if (code === '42P01' || code === '42703') return true
  const msg = err instanceof Error ? err.message : String(err)
  return /relation .* does not exist|column .* does not exist/i.test(msg)
}
function isStripeUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /STRIPE_SECRET_KEY|Stripe(Authentication|Connection)Error|fetch failed/i.test(msg)
}

const TIER_PRICES_CENTS = { basic: 9900, pro: 14900, premium: 19900 } as const

// ─────────────────────────────────────────────────────────────────────────────
// Clinic list — one row per clinic org, joined with profile + counts
// ─────────────────────────────────────────────────────────────────────────────

export interface ClinicListRow {
  orgId: string
  name: string
  slug: string
  displayName: string | null
  logoUrl: string | null
  brandColor: string | null
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
  planTier: 'basic' | 'pro' | 'premium'
  subscriptionStatus: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  /** 'self_serve' | 'managed' | 'comped' — platform-provisioned billing state. Absent = self_serve. */
  billingMode?: string | null
  /** Managed clinics: reserved plan awaiting owner checkout. */
  pendingPlanId?: string | null
  createdAt: Date
  /** The demo clinic — shown in the list (it's the demo entry point) but
   *  excluded from every top-line aggregate (MRR, active, new-in-30d). */
  isDemo: boolean
  /** Monthly recurring revenue this clinic contributes (cents). */
  monthlyContributionCents: number
  memberCount: number
  patientCount: number
  activeProjectCount: number
  hasWebsiteContent: boolean
}

export async function listClinics(): Promise<ClinicListRow[]> {
  try {
    const rows = await db
      .select({
        orgId: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: organization.createdAt,
        isDemo: organization.isDemo,
        displayName: clinicProfile.displayName,
        logoUrl: clinicProfile.logoUrl,
        brandColor: clinicProfile.brandColor,
        email: clinicProfile.email,
        phone: clinicProfile.phone,
        city: clinicProfile.city,
        state: clinicProfile.state,
        tagline: clinicProfile.tagline,
        about: clinicProfile.about,
        planTier: clinicProfile.planTier,
        subscriptionStatus: clinicProfile.subscriptionStatus,
        stripeCustomerId: clinicProfile.stripeCustomerId,
        stripeSubscriptionId: clinicProfile.stripeSubscriptionId,
        billingMode: clinicProfile.billingMode,
        pendingPlanId: clinicProfile.pendingPlanId,
      })
      .from(organization)
      .leftJoin(clinicProfile, eq(clinicProfile.organizationId, organization.id))
      .where(eq(organization.type, 'clinic'))
      .orderBy(desc(organization.createdAt))

    if (rows.length === 0) return []

    // Member count per org
    const memberCounts = await db
      .select({
        orgId: member.organizationId,
        count: sql<number>`count(${member.id})::int`,
      })
      .from(member)
      .groupBy(member.organizationId)
    const membersByOrg = new Map(memberCounts.map((r) => [r.orgId, Number(r.count)]))

    // Patient count per org (clinic-scoped)
    let patientsByOrg = new Map<string, number>()
    try {
      const patientCounts = await db
        .select({
          orgId: patient.organizationId,
          count: sql<number>`count(${patient.id})::int`,
        })
        .from(patient)
        .groupBy(patient.organizationId)
      patientsByOrg = new Map(patientCounts.map((r) => [r.orgId, Number(r.count)]))
    } catch (err) {
      if (!isMissingSchema(err)) throw err
    }

    // Active project count per org
    let projectsByOrg = new Map<string, number>()
    try {
      const projectCounts = await db
        .select({
          orgId: agencyProject.organizationId,
          count: sql<number>`count(${agencyProject.id})::int`,
        })
        .from(agencyProject)
        .where(sql`${agencyProject.status} in ('lead','discovery','in_progress','review')`)
        .groupBy(agencyProject.organizationId)
      projectsByOrg = new Map(
        projectCounts.filter((r) => r.orgId).map((r) => [r.orgId as string, Number(r.count)]),
      )
    } catch (err) {
      if (!isMissingSchema(err)) throw err
    }

    return rows.map<ClinicListRow>((r) => {
      const planTier = (r.planTier ?? 'basic') as ClinicListRow['planTier']
      const isActive =
        r.subscriptionStatus === 'active' || r.subscriptionStatus === 'trialing'
      const monthlyContributionCents = isActive ? TIER_PRICES_CENTS[planTier] : 0
      const hasWebsiteContent =
        !!(r.tagline || r.about || r.email || r.phone)

      return {
        orgId: r.orgId,
        name: r.name,
        slug: r.slug,
        displayName: r.displayName,
        logoUrl: r.logoUrl,
        brandColor: r.brandColor,
        email: r.email,
        phone: r.phone,
        city: r.city,
        state: r.state,
        planTier,
        subscriptionStatus: r.subscriptionStatus,
        stripeCustomerId: r.stripeCustomerId,
        stripeSubscriptionId: r.stripeSubscriptionId,
        billingMode: r.billingMode ?? 'self_serve',
        pendingPlanId: r.pendingPlanId,
        createdAt: r.createdAt,
        isDemo: r.isDemo === true,
        monthlyContributionCents,
        memberCount: membersByOrg.get(r.orgId) ?? 0,
        patientCount: patientsByOrg.get(r.orgId) ?? 0,
        activeProjectCount: projectsByOrg.get(r.orgId) ?? 0,
        hasWebsiteContent,
      }
    })
  } catch (err) {
    if (isMissingSchema(err)) return []
    throw err
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clinic detail — single clinic with members, projects, revenue
// ─────────────────────────────────────────────────────────────────────────────

export interface ClinicMember {
  userId: string
  email: string
  name: string
  role: string
  joinedAt: Date
}

export interface ClinicProjectRow {
  id: string
  title: string
  type: string
  status: string
  budgetCents: number | null
  dueDate: Date | null
  completedAt: Date | null
  updatedAt: Date
}

export interface ClinicInvoiceRow {
  id: string
  number: string | null
  status: string
  amountCents: number
  paid: boolean
  createdAt: Date
}

export interface ClinicDetail {
  orgId: string
  name: string
  slug: string
  createdAt: Date
  profile: ClinicProfile | null
  members: ClinicMember[]
  patientCount: number
  upcomingAppointmentCount: number
  projects: ClinicProjectRow[]
  invoices: ClinicInvoiceRow[]
  /** Lifetime subscription revenue (cents). Pulled live from Stripe. */
  lifetimeSubscriptionCents: number
  /** Lifetime project revenue (cents). */
  lifetimeProjectCents: number
  stripeUnavailable: boolean
}

export async function getClinicDetail(orgId: string): Promise<ClinicDetail | null> {
  const [org] = await db
    .select()
    .from(organization)
    .where(and(eq(organization.id, orgId), eq(organization.type, 'clinic')))
    .limit(1)
  if (!org) return null

  let profile: ClinicProfile | null = null
  try {
    const [p] = await db
      .select()
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, orgId))
      .limit(1)
    profile = p ?? null
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }

  // Members
  const memberRows = await db
    .select({
      userId: member.userId,
      role: member.role,
      joinedAt: member.createdAt,
      email: user.email,
      name: user.name,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .orderBy(member.createdAt)

  // Patient + appointment counts
  let patientCount = 0
  let upcomingAppointmentCount = 0
  try {
    const [pc] = await db
      .select({ count: sql<number>`count(${patient.id})::int` })
      .from(patient)
      .where(eq(patient.organizationId, orgId))
    patientCount = Number(pc?.count ?? 0)

    const [ac] = await db
      .select({ count: sql<number>`count(${appointment.id})::int` })
      .from(appointment)
      .where(
        and(
          eq(appointment.organizationId, orgId),
          sql`${appointment.startTime} >= now()`,
        ),
      )
    upcomingAppointmentCount = Number(ac?.count ?? 0)
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }

  // Projects (last 50)
  let projects: ClinicProjectRow[] = []
  let lifetimeProjectCents = 0
  try {
    const projRows = await db
      .select({
        id: agencyProject.id,
        title: agencyProject.title,
        type: agencyProject.type,
        status: agencyProject.status,
        budgetCents: agencyProject.budgetCents,
        dueDate: agencyProject.dueDate,
        completedAt: agencyProject.completedAt,
        updatedAt: agencyProject.updatedAt,
      })
      .from(agencyProject)
      .where(eq(agencyProject.organizationId, orgId))
      .orderBy(desc(agencyProject.updatedAt))
      .limit(50)
    projects = projRows
    for (const p of projRows) {
      if (p.status === 'completed' && p.budgetCents) lifetimeProjectCents += p.budgetCents
    }
  } catch (err) {
    if (!isMissingSchema(err)) throw err
  }

  // Stripe invoices for this customer
  let invoices: ClinicInvoiceRow[] = []
  let lifetimeSubscriptionCents = 0
  let stripeUnavailable = false
  if (profile?.stripeCustomerId) {
    try {
      const list = await stripe.invoices.list({
        customer: profile.stripeCustomerId,
        limit: 50,
      })
      invoices = list.data.map((i: Stripe.Invoice) => ({
        id: i.id ?? `inv_${i.created}`,
        number: i.number ?? null,
        status: i.status ?? 'unknown',
        amountCents: i.status === 'paid' ? i.amount_paid : i.amount_due,
        paid: i.status === 'paid',
        createdAt: new Date(i.created * 1000),
      }))
      for (const inv of list.data) {
        if (inv.status === 'paid') lifetimeSubscriptionCents += inv.amount_paid
      }
    } catch (err) {
      if (isStripeUnavailable(err)) stripeUnavailable = true
      else throw err
    }
  }

  return {
    orgId: org.id,
    name: org.name,
    slug: org.slug,
    createdAt: org.createdAt,
    profile,
    members: memberRows.map((m) => ({
      userId: m.userId,
      email: m.email,
      name: m.name,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    patientCount,
    upcomingAppointmentCount,
    projects,
    invoices,
    lifetimeSubscriptionCents,
    lifetimeProjectCents,
    stripeUnavailable,
  }
}
