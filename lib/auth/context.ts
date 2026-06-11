import 'server-only'
import { headers, cookies } from 'next/headers'
import { auth } from './server'
import { db } from '@/lib/db'
import { organization, member } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'
import { patient } from '@/lib/db/schema/clinic'
import { referralPartner } from '@/lib/db/schema/referrals'
import { eq, and } from 'drizzle-orm'
import type { TenantType, PlanTier, Role } from '@/lib/modules/types'
import { planAllows } from '@/lib/modules'

export interface TenantContext {
  userId: string
  userEmail: string
  userName: string
  platformAdmin: boolean
  organizationId: string
  organizationName: string
  organizationSlug: string
  tenantType: TenantType
  role: Role
  planTier: PlanTier
  patientId: string | null
  isDemo: boolean
  /**
   * True for a platform-provisioned ('managed') clinic whose reserved plan
   * hasn't been activated yet — drives the "finish billing setup" banner.
   * Optional: absent/undefined means false (self-serve clinics, platform,
   * patients, demo contexts).
   */
  billingActivationPending?: boolean
  /**
   * Raw Stripe subscription status from the clinic_profile row this request
   * already loads (e.g. 'active' | 'trialing' | 'past_due' | 'unpaid' |
   * 'canceled' | 'incomplete' | 'incomplete_expired'). Drives the dunning
   * banner + Settings → Billing status pill. Optional: undefined/null for
   * platform, patients, demo, and clinics that never started a subscription
   * (so existing test fixtures don't need to set it).
   */
  subscriptionStatus?: string | null
}

interface DemoContext {
  orgId: string
  role: Role
  patientId?: string
}

/**
 * Build a 'partner' tenant context from a referral_partner row linked to this
 * user. Returns null when the user isn't a partner, or the partner row is
 * suspended/unaccepted. A partner has NO organization in the membership sense —
 * we surface their partner id as the organizationId so downstream code that
 * keys on it still works, and the partner-only surfaces resolve the row by
 * user_id directly.
 */
async function resolvePartnerContext(
  user: { id: string; email: string; name: string },
  isPlatformAdmin: boolean,
): Promise<TenantContext | null> {
  const [p] = await db
    .select({ id: referralPartner.id, status: referralPartner.status, name: referralPartner.name })
    .from(referralPartner)
    .where(eq(referralPartner.userId, user.id))
    .limit(1)
  if (!p || p.status !== 'active') return null
  return {
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    platformAdmin: isPlatformAdmin,
    organizationId: p.id,
    organizationName: p.name,
    organizationSlug: '',
    tenantType: 'partner',
    role: 'member',
    planTier: 'basic',
    patientId: null,
    isDemo: false,
    billingActivationPending: false,
    subscriptionStatus: null,
  }
}

/**
 * Resolves the current tenant context from the session.
 *
 * Platform admins can set a demo_context cookie to simulate any clinic or
 * patient view without changing their actual session.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  const isPlatformAdmin = (session.user as { platformAdmin?: boolean }).platformAdmin ?? false

  const cookieStore = await cookies()
  const demoCookie = cookieStore.get('demo_context')
  if (isPlatformAdmin && demoCookie?.value) {
    try {
      const demo: DemoContext = JSON.parse(demoCookie.value)
      if (demo.orgId) {
        const [org] = await db.select().from(organization).where(eq(organization.id, demo.orgId)).limit(1)
        if (org) {
          let planTier: PlanTier = 'basic'
          let subscriptionStatus: string | null = null
          if (org.type === 'clinic') {
            const [profile] = await db
              .select()
              .from(clinicProfile)
              .where(eq(clinicProfile.organizationId, org.id))
              .limit(1)
            if (profile?.planTier) planTier = profile.planTier as PlanTier
            subscriptionStatus = profile?.subscriptionStatus ?? null
          }
          const role = demo.role ?? 'member'
          const tenantType: TenantType =
            org.type === 'platform' ? 'platform' : role === 'patient' ? 'patient' : 'clinic'
          return {
            userId: session.user.id,
            userEmail: session.user.email,
            userName: session.user.name,
            platformAdmin: true,
            organizationId: org.id,
            organizationName: org.name,
            organizationSlug: org.slug,
            tenantType,
            role: role as Role,
            planTier,
            patientId: demo.patientId ?? null,
            isDemo: true,
            billingActivationPending: false,
            subscriptionStatus,
          }
        }
      }
    } catch {
      // malformed cookie — fall through to real context
    }
  }

  let activeOrgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId

  // Resolve this user's membership in the active org. If the session still
  // points at an org the user is NOT a member of (e.g. they were removed from
  // the clinic but their session carries the stale id, or activeOrganizationId
  // was never set), fall back to their first real membership — never grant a
  // default 'member' context for an org they don't belong to.
  let memberRow = activeOrgId
    ? (
        await db
          .select()
          .from(member)
          .where(and(eq(member.organizationId, activeOrgId), eq(member.userId, session.user.id)))
          .limit(1)
      )[0]
    : undefined

  if (!memberRow) {
    const [firstMembership] = await db
      .select()
      .from(member)
      .where(eq(member.userId, session.user.id))
      .limit(1)
    if (!firstMembership) {
      // No org membership at all. This may be an external referral partner —
      // resolved purely from the referral_partner.user_id linkage (no org
      // machinery), mirroring the patient-portal pattern. platformAdmins +
      // clinic members never reach here, so their tenancy always wins.
      const partnerCtx = await resolvePartnerContext(session.user, isPlatformAdmin)
      if (partnerCtx) return partnerCtx
      return null
    }
    activeOrgId = firstMembership.organizationId
    memberRow = firstMembership
  }

  if (!activeOrgId) return null

  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, activeOrgId))
    .limit(1)

  if (!org) return null

  let planTier: PlanTier = 'basic'
  let billingActivationPending = false
  let subscriptionStatus: string | null = null
  if (org.type === 'clinic') {
    const [profile] = await db
      .select()
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, activeOrgId))
      .limit(1)
    if (profile?.planTier) planTier = profile.planTier as PlanTier
    subscriptionStatus = profile?.subscriptionStatus ?? null
    billingActivationPending =
      profile?.billingMode === 'managed' &&
      Boolean(profile?.pendingPlanId) &&
      profile?.subscriptionStatus !== 'active' &&
      profile?.subscriptionStatus !== 'trialing'
  }

  const tenantType: TenantType =
    org.type === 'platform'
      ? 'platform'
      : memberRow.role === 'patient'
        ? 'patient'
        : 'clinic'

  let patientId: string | null = null
  if (tenantType === 'patient') {
    const [patientRow] = await db
      .select({ id: patient.id })
      .from(patient)
      .where(and(eq(patient.userId, session.user.id), eq(patient.organizationId, activeOrgId)))
      .limit(1)
    patientId = patientRow?.id ?? null
  }

  return {
    userId: session.user.id,
    userEmail: session.user.email,
    userName: session.user.name,
    platformAdmin: isPlatformAdmin,
    organizationId: org.id,
    organizationName: org.name,
    organizationSlug: org.slug,
    tenantType,
    role: memberRow.role as Role,
    planTier,
    patientId,
    isDemo: false,
    billingActivationPending,
    subscriptionStatus,
  }
}

/**
 * Server helper for pages/actions that require a resolved tenant context.
 * Use this instead of `requireUser()` in any code that does DB queries
 * scoped to an organization.
 */
export async function requireTenant(): Promise<TenantContext> {
  const ctx = await getTenantContext()
  if (!ctx) {
    const { redirect } = await import('next/navigation')
    redirect('/signin')
  }
  return ctx as TenantContext
}

/**
 * Asserts the tenant has at least one of the given roles. Use after
 * requireTenant() to gate destructive actions.
 */
export async function requireRole(roles: Role | Role[]): Promise<TenantContext> {
  const ctx = await requireTenant()
  const allowed = Array.isArray(roles) ? roles : [roles]
  if (!allowed.includes(ctx.role)) {
    const { redirect } = await import('next/navigation')
    redirect('/')
  }
  return ctx
}

/**
 * Plan-gate a page or server action. Mirrors the sidebar's plan gating
 * (`lib/modules` is the single source of truth for the tier ordering) so a
 * clinic can't deep-link a paid page or fire its server action below tier.
 *
 * Plan gating only applies to clinic tenants — platform admins (incl. demo
 * mode, which inherits the demo org's tier) and others pass through. On a
 * below-tier clinic this REDIRECTS to the Plan page with the requested module
 * as `?upgrade=<module>` so the plans page can show a friendly upgrade panel;
 * actions that want a thrown error instead should use `planAllows` directly.
 */
export async function requirePlan(ctx: TenantContext, minPlan: PlanTier, module?: string): Promise<void> {
  if (ctx.tenantType !== 'clinic') return
  if (planAllows(ctx.planTier, minPlan)) return
  const { redirect } = await import('next/navigation')
  redirect(module ? `/settings/plans?upgrade=${encodeURIComponent(module)}` : '/settings/plans')
}
