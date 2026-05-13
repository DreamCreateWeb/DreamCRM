import { db } from '@/lib/db'
import { organization, member, user } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'
import { eq, count, desc } from 'drizzle-orm'

export interface ClinicRow {
  id: string
  name: string
  slug: string
  ownerEmail: string | null
  ownerName: string | null
  planTier: string | null
  subscriptionStatus: string | null
  memberCount: number
  createdAt: Date
}

/**
 * List every clinic (organization of type='clinic') with its profile data
 * and the owner user. Joined query — used by the platform Clinics list page.
 */
export async function listClinics(): Promise<ClinicRow[]> {
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      planTier: clinicProfile.planTier,
      subscriptionStatus: clinicProfile.subscriptionStatus,
    })
    .from(organization)
    .leftJoin(clinicProfile, eq(clinicProfile.organizationId, organization.id))
    .where(eq(organization.type, 'clinic'))
    .orderBy(desc(organization.createdAt))

  // For each clinic, count members + find an owner email
  const results: ClinicRow[] = []
  for (const row of rows) {
    const [{ memberCount }] = await db
      .select({ memberCount: count() })
      .from(member)
      .where(eq(member.organizationId, row.id))

    const [owner] = await db
      .select({ email: user.email, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, row.id))
      .limit(1)

    results.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdAt: row.createdAt,
      planTier: row.planTier,
      subscriptionStatus: row.subscriptionStatus,
      memberCount: Number(memberCount),
      ownerEmail: owner?.email ?? null,
      ownerName: owner?.name ?? null,
    })
  }

  return results
}
