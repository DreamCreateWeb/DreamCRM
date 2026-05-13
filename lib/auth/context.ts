import { headers } from 'next/headers'
import { auth } from './server'
import { db } from '@/lib/db'
import { organization, member } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'
import { eq } from 'drizzle-orm'
import type { TenantType, PlanTier, Role } from '@/lib/modules/types'

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
}

/**
 * Resolves the current tenant context from the session.
 *
 * - Pulls the active session via Better Auth
 * - Looks up the active organization (Better Auth stores this on the session)
 * - Joins the org's clinic_profile (if it's a clinic) to get the plan tier
 * - Returns a single object with everything a server component / route handler
 *   needs to make decisions
 *
 * Returns null when no valid session — the caller is responsible for redirecting.
 */
export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  // Better Auth stores activeOrganizationId on the session, but it's null on a
  // freshly created session. Fall back to the user's first membership so a user
  // who only belongs to one org never needs to switch manually.
  let activeOrgId = session.session.activeOrganizationId

  if (!activeOrgId) {
    const [firstMembership] = await db
      .select()
      .from(member)
      .where(eq(member.userId, session.user.id))
      .limit(1)
    if (!firstMembership) return null
    activeOrgId = firstMembership.organizationId
  }

  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, activeOrgId))
    .limit(1)

  if (!org) return null

  const [memberRow] = await db
    .select()
    .from(member)
    .where(eq(member.organizationId, activeOrgId))
    .limit(1)

  let planTier: PlanTier = 'basic'
  if (org.type === 'clinic') {
    const [profile] = await db
      .select()
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, activeOrgId))
      .limit(1)
    if (profile?.planTier) planTier = profile.planTier as PlanTier
  }

  const tenantType: TenantType =
    org.type === 'platform' ? 'platform' :
    memberRow?.role === 'patient' ? 'patient' :
    'clinic'

  return {
    userId: session.user.id,
    userEmail: session.user.email,
    userName: session.user.name,
    platformAdmin: (session.user as { platformAdmin?: boolean }).platformAdmin ?? false,
    organizationId: org.id,
    organizationName: org.name,
    organizationSlug: org.slug,
    tenantType,
    role: (memberRow?.role ?? 'member') as Role,
    planTier,
  }
}
