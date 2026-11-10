import 'server-only'
import { headers, cookies } from 'next/headers'
import { auth } from './server'
import { db } from '@/lib/db'
import { organization, member } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'
import { patient } from '@/lib/db/schema/clinic'
import { referralPartner } from '@/lib/db/schema/referrals'
import { prospectCaller } from '@/lib/db/schema/prospecting'
import { eq, and, asc } from 'drizzle-orm'
import type { TenantType, PlanTier, Role } from '@/lib/modules/types'
import { resolveTrialState } from '@/lib/trial'
import { enforceTwoFactor } from './two-factor-gate'

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
  /**
   * True ONLY when the org is the actual demo clinic (organization.is_demo)
   * — the flag that gates demo data, network suppression, presenter mode,
   * and money-adjacent features. NOT set for a REAL clinic viewed via
   * "View as" (that's `viaViewAs`) — the owner operates real clinics
   * through view-as during white-glove onboarding and gets full,
   * real behavior there (split 2026-07-21; the two meanings used to ride
   * this one flag and demo-restricted real clinics).
   */
  isDemo: boolean
  /**
   * True when this context came from the platform-admin "View as" cookie —
   * real org or demo alike. Drives the impersonation chrome (banner, exit
   * chip, hairline), never feature gates.
   */
  viaViewAs?: boolean
  /**
   * Raw Stripe subscription status from the clinic_profile row this request
   * already loads (e.g. 'active' | 'trialing' | 'past_due' | 'unpaid' |
   * 'canceled' | 'incomplete' | 'incomplete_expired'). Drives the dunning
   * banner + Settings → Billing status pill. Optional: undefined/null for
   * platform, patients, demo, and clinics that never started a subscription
   * (so existing test fixtures don't need to set it).
   */
  subscriptionStatus?: string | null
  /**
   * No-card free-trial state derived from the clinic_profile billing fields
   * (see lib/trial.ts). `onTrial` drives the countdown banner; `trialExpired`
   * drives the "set up billing" LOCK wall (DashboardShell renders it instead of
   * the page). Both false for paid + comped clinics, platform, patients,
   * partners, and demo contexts; `trialEndsAt` is null unless a trial is set.
   */
  onTrial?: boolean
  trialExpired?: boolean
  /**
   * The prospect_caller row's status when tenantType is 'caller' (P-02) —
   * 'active' | 'paused' | 'archived'. A paused or archived caller STILL
   * resolves a context (so the root never mistakes them for a brand-new
   * user and walks them into clinic onboarding); `requireCaller` is what
   * enforces 'active', and /calls renders the calm state for the rest.
   */
  callerStatus?: import('@/lib/db/schema/prospecting').ProspectCallerStatus | null
  trialEndsAt?: Date | null
  /**
   * True for a managed clinic that still has a RESERVED plan to activate
   * (pendingPlanId set — cleared by the webhook once they pay). Routes the trial
   * banner + lock wall to the coupon-pre-applied `/billing/activate` flow instead
   * of the self-serve plan picker.
   */
  hasReservedPlan?: boolean
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
    viaViewAs: false,
    subscriptionStatus: null,
  }
}

/**
 * Build a 'caller' tenant context from a prospect_caller row linked to this
 * user (P-02). Mirrors the partner's, with one deliberate difference: a
 * caller of ANY status resolves (active, paused, archived — `callerStatus`
 * says which). A paused caller with no membership used to resolve to NULL,
 * which requireTenant read as "not signed in" and the root read as "a new
 * user" — straight into clinic onboarding. A platform admin never resolves
 * here (their membership tenancy wins long before this runs, and an admin is
 * never a hired caller), and the caller row's id rides `organizationId` so
 * downstream code that keys on it still works — it is `pcal_…`, which no
 * tenant table's organization_id can ever equal, so a clinic read scoped by
 * it is empty and a clinic write fails its FK.
 */
async function resolveCallerContext(
  user: { id: string; email: string; name: string },
  isPlatformAdmin: boolean,
): Promise<TenantContext | null> {
  if (isPlatformAdmin) return null
  const [c] = await db
    .select({ id: prospectCaller.id, status: prospectCaller.status, name: prospectCaller.name })
    .from(prospectCaller)
    .where(eq(prospectCaller.userId, user.id))
    .limit(1)
  if (!c) return null
  return {
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    platformAdmin: false,
    organizationId: c.id,
    organizationName: c.name,
    organizationSlug: '',
    tenantType: 'caller',
    role: 'member',
    planTier: 'basic',
    patientId: null,
    isDemo: false,
    viaViewAs: false,
    subscriptionStatus: null,
    callerStatus: c.status as import('@/lib/db/schema/prospecting').ProspectCallerStatus,
  }
}

/**
 * Resolves the current tenant context from the session.
 *
 * Platform admins can set a demo_context cookie to simulate any clinic or
 * patient view without changing their actual session.
 *
 * PRECEDENCE (which tenancy "wins" when a single user wears several hats —
 * one email = one better-auth user across platform/clinic/patient/partner):
 *   1. demo_context cookie (platformAdmin only) — an explicit "view as".
 *   2. The active-org membership (`session.activeOrganizationId`), if the user
 *      is actually a member of it. Platform org → 'platform'; clinic org with
 *      role 'patient' → 'patient', else → 'clinic'.
 *   3. The user's FIRST membership (when the active org is stale / unset).
 *   4. Partner derivation — ONLY when the user has NO org membership at all.
 *   5. Caller derivation (P-02) — the same condition, after the partner.
 *
 * The catch: a multi-persona user (e.g. a platform admin or clinic staffer who
 * is ALSO a referral partner) resolves to their MEMBERSHIP tenancy here, so
 * `tenantType` is never 'partner' for them. That's correct for `/` routing
 * (their primary home is the dashboard), but it means partner SURFACES must NOT
 * gate on `tenantType === 'partner'` — they'd lock the multi-persona partner
 * out of their own portal. Partner pages/actions authorize via
 * {@link requirePartner} (a direct `referral_partner.user_id` lookup) instead,
 * which works for every persona. Likewise a staff-member-who-is-also-a-patient
 * reaches `/patient/*` because the portal layout resolves the patient row by
 * user_id rather than trusting `tenantType` alone.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  const isPlatformAdmin = (session.user as { platformAdmin?: boolean }).platformAdmin ?? false

  const twoFactorEnabled = (session.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled === true
  // The platform admin is REQUIRED to have a second factor — before ANY
  // context (view-as included) is handed out. A server redirect to the enrol
  // page (ML-58); the enrol page never calls this function.
  enforceTwoFactor({
    platformAdmin: isPlatformAdmin,
    twoFactorEnabled,
    role: null,
    tenantType: null,
    clinicRequires: false,
  })

  const cookieStore = await cookies()
  const demoCookie = cookieStore.get('demo_context')
  if (isPlatformAdmin && demoCookie?.value) {
    try {
      const demo: DemoContext = JSON.parse(demoCookie.value)
      // Every view-as writer stamps an explicit role ('owner' for clinics,
      // 'patient' for portal view-as). A role-less cookie is malformed /
      // legacy — ignore it entirely rather than guessing a role (the old
      // `?? 'member'` fallback silently DEMOTED the admin below the
      // owner-gated settings they need while onboarding).
      if (demo.orgId && demo.role) {
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
          const role = demo.role
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
            // Demo semantics belong to the demo ORG, not to view-as itself —
            // a real clinic operated via view-as behaves fully real.
            isDemo: org.isDemo === true,
            viaViewAs: true,
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
    // Deterministic "first" — oldest membership wins, so a multi-clinic
    // patient always lands in the SAME org (and it matches the magic-link
    // email's brand, which orders the same way). An unordered limit(1) here
    // let the landing org flip between requests.
    const [firstMembership] = await db
      .select()
      .from(member)
      .where(eq(member.userId, session.user.id))
      .orderBy(asc(member.createdAt))
      .limit(1)
    if (!firstMembership) {
      // No org membership at all. This may be an external referral partner —
      // resolved purely from the referral_partner.user_id linkage (no org
      // machinery), mirroring the patient-portal pattern. platformAdmins +
      // clinic members never reach here, so their tenancy always wins.
      const partnerCtx = await resolvePartnerContext(session.user, isPlatformAdmin)
      if (partnerCtx) return partnerCtx
      // …or a hired cold caller (P-02) — the same derivation from
      // prospect_caller.user_id, after the partner so an existing persona
      // keeps its home.
      const callerCtx = await resolveCallerContext(session.user, isPlatformAdmin)
      if (callerCtx) return callerCtx
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
  let subscriptionStatus: string | null = null
  let clinicRequiresTwoFactor = false
  let onTrial = false
  let trialExpired = false
  let trialEndsAt: Date | null = null
  let hasReservedPlan = false
  if (org.type === 'clinic') {
    const [profile] = await db
      .select()
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, activeOrgId))
      .limit(1)
    if (profile?.planTier) planTier = profile.planTier as PlanTier
    subscriptionStatus = profile?.subscriptionStatus ?? null
    clinicRequiresTwoFactor = profile?.requireTwoFactor === 1
    const trial = resolveTrialState({
      trialEndsAt: profile?.trialEndsAt ?? null,
      subscriptionStatus: profile?.subscriptionStatus ?? null,
      stripeSubscriptionId: profile?.stripeSubscriptionId ?? null,
    })
    onTrial = trial.onTrial
    trialExpired = trial.expired
    trialEndsAt = trial.trialEndsAt
    hasReservedPlan = profile?.billingMode === 'managed' && Boolean(profile?.pendingPlanId)
  }

  const tenantType: TenantType =
    org.type === 'platform'
      ? 'platform'
      : memberRow.role === 'patient'
        ? 'patient'
        : 'clinic'

  // The owner's "require two-step sign-in for the team" switch (ML-58): a
  // staff member without a factor is sent to enrol on their next page load.
  enforceTwoFactor({
    platformAdmin: isPlatformAdmin,
    twoFactorEnabled,
    role: memberRow.role,
    tenantType,
    clinicRequires: clinicRequiresTwoFactor,
  })

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
    // Membership in the demo org (rare, but the seeded owner tests portal
    // flows) still counts as demo — the flag follows the ORG, not the path.
    isDemo: org.isDemo === true,
    viaViewAs: false,
    subscriptionStatus,
    onTrial,
    trialExpired,
    trialEndsAt,
    hasReservedPlan,
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

/** The active partner row + session ctx, returned by {@link requirePartner}. */
export interface PartnerSession {
  ctx: TenantContext
  partner: import('@/lib/db/schema/referrals').ReferralPartner
}

/**
 * Authorize a referral-partner surface (portal pages + partner actions).
 *
 * Crucially this does NOT gate on `tenantType === 'partner'`: a user can be a
 * partner AND a platform admin / clinic staffer at the same time (one email =
 * one user), in which case `getTenantContext` resolves their MEMBERSHIP tenancy
 * and `tenantType` is never 'partner'. Gating partner pages on tenantType would
 * lock those multi-persona partners out of their own portal. Instead we resolve
 * the partner row directly from the session user id — which works for every
 * persona.
 *
 * `redirectOnFail` (default true) sends a non-partner / non-resolvable user to
 * `/` (which re-routes by their primary tenancy). Set false in server actions
 * that prefer to throw.
 *
 * `allowInactive` (default false): by default this requires an ACTIVE partner —
 * a suspended/archived partner is treated like a non-partner (redirected or
 * thrown). The portal layout/page pass `allowInactive: true` so they can
 * RESOLVE a suspended/archived partner row and render the right surface
 * (suspended → "account paused" banner + disabled withdraw; archived → a calm
 * "account closed" screen). Server actions keep the strict default so a
 * suspended/archived partner can't fire a mutation.
 */
export async function requirePartner(
  opts: { redirectOnFail?: boolean; allowInactive?: boolean } = {},
): Promise<PartnerSession> {
  const ctx = await requireTenant()
  const { getPartnerByUserId } = await import('@/lib/services/referrals')
  const partner = await getPartnerByUserId(ctx.userId)
  // A row is "acceptable" when it exists AND (active OR allowInactive). Archived
  // is never active, so the strict path treats it as inactive.
  const acceptable = partner && (opts.allowInactive || partner.status === 'active')
  if (!acceptable) {
    if (opts.redirectOnFail === false) {
      throw new Error('Forbidden: active partner account required')
    }
    const { redirect } = await import('next/navigation')
    redirect('/')
  }
  return { ctx, partner: partner as import('@/lib/db/schema/referrals').ReferralPartner }
}

/** The caller row + session ctx, returned by {@link requireCaller}. */
export interface CallerSession {
  ctx: TenantContext
  caller: import('@/lib/db/schema/prospecting').ProspectCaller
}

/**
 * Authorize a cold-caller surface (the /calls portal + its actions) — P-02.
 *
 * The same shape as {@link requirePartner}: a DIRECT `prospect_caller.user_id`
 * lookup, never `tenantType === 'caller'`, so a caller who also holds some
 * membership still reaches their queue. What the row grants is exactly one
 * thing — their own queue. Every read and write behind this helper filters by
 * `assigned_caller_id = caller.id`, and nothing here hands out an org, a
 * clinic or a patient.
 *
 * `redirectOnFail` (default true) sends a non-caller to `/` (which re-routes
 * by their primary tenancy) and an INACTIVE caller to `/calls`, where the
 * paused / closed screen renders — never to /signin, which would read a
 * paused caller as a stranger and walk them into clinic onboarding; false
 * throws, for server actions.
 *
 * `allowInactive` (default false): the strict default requires an ACTIVE
 * caller; the portal layout/page pass true so a paused / archived caller
 * still resolves and reads the right calm state. Actions keep the strict
 * default so a paused caller cannot log a call. Pausing or archiving never
 * needs a session revoked: the status is read on every request.
 */
export async function requireCaller(
  opts: { redirectOnFail?: boolean; allowInactive?: boolean } = {},
): Promise<CallerSession> {
  const ctx = await requireTenant()
  const { getCallerByUserId } = await import('@/lib/services/prospect-callers')
  const caller = await getCallerByUserId(ctx.userId)
  const acceptable = caller && (opts.allowInactive || caller.status === 'active')
  if (!acceptable) {
    if (opts.redirectOnFail === false) {
      throw new Error('Forbidden: active caller account required')
    }
    const { redirect } = await import('next/navigation')
    redirect(caller ? '/calls' : '/')
  }
  return { ctx, caller: caller as import('@/lib/db/schema/prospecting').ProspectCaller }
}
