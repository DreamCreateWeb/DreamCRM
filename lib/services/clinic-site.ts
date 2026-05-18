import 'server-only'
import { eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { clinicProfile, clinicLocation } from '@/lib/db/schema/platform'
import type { ClinicProfile, ClinicLocation } from '@/lib/db/schema/platform'

export interface ClinicSiteData {
  orgId: string
  orgName: string
  slug: string
  profile: ClinicProfile
  primaryLocation: ClinicLocation | null
  locations: ClinicLocation[]
}

export async function getClinicSiteBySlug(slug: string): Promise<ClinicSiteData | null> {
  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1)

  if (!org || org.type !== 'clinic') return null

  return loadSite(org.id, org.slug, org.name)
}

export async function getClinicSiteByDomain(domain: string): Promise<ClinicSiteData | null> {
  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.websiteDomain, domain))
    .limit(1)

  if (!profile) return null

  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, profile.organizationId))
    .limit(1)

  if (!org) return null

  return loadSite(org.id, org.slug, org.name)
}

async function loadSite(orgId: string, slug: string, orgName: string): Promise<ClinicSiteData | null> {
  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)

  if (!profile) return null

  const locations = await db
    .select()
    .from(clinicLocation)
    .where(eq(clinicLocation.organizationId, orgId))
    .orderBy(desc(clinicLocation.isPrimary), clinicLocation.createdAt)

  return {
    orgId,
    orgName,
    slug,
    profile,
    primaryLocation: locations.find((l) => l.isPrimary === 1) ?? locations[0] ?? null,
    locations,
  }
}
