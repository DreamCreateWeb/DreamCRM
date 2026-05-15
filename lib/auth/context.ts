import { headers, cookies } from 'next/headers'
import { auth } from './server'
import { db } from '@/lib/db'
import { organization, member } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'
import { patient } from '@/lib/db/schema/clinic'
import { eq, and } from 'drizzle-orm'
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
  patientId: string | null
  isDemo: boolean
}

interface DemoContext {
  orgId: string
  role: Role
  patientId?: string
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

  // Demo mode: platform admins can simulate any org/role via cookie
  const cookieStore = await cookies()
  const demoCookie = cookieStore.get('demo_context')
  if (isPlatformAdmin && demoCookie?.value) {
    try {
      const demo: DemoContext = JSON.parse(demoCookie.value)
      if (demo.orgId) {
        const [org] = await db.select().from(organization).where(eq(organization.id, demo.orgId)).limit(1)
        if (org) {
          let planTier: PlanTier = 'basic'
          if (org.type === 'clinic') {
            const [profile] = await db.select().from(clinicProfile).where(eq(clinicProfile.organizationId, org.id)).limit(1)
            if (profile?.planTier) planTier = profile.planTier as PlanTier
          }
          const role = demo.role ?? 'member'
          const tenantType: TenantType =
            org.type === 'platform' ? 'platform' :
            role === 'patient' ? 'patient' :
            'clinic'
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
          }
        }
      }
    } catch {
      // malformed cookie — fall through to real context
    }
  }

  let activeOrgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId

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

  // For patient role members, look up their patient record
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
    role: (memberRow?.role ?? 'member') as Role,
    planTier,
    patientId,
    isDemo: false,
  }
}
