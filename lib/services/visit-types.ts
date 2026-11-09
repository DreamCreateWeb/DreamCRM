import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { resolveVisitTypes, type VisitType } from '@/lib/types/visit-types'

/**
 * The clinic's visit-type catalog, resolved (defaults when nothing is
 * configured — lib/types/visit-types.ts). The intake rules card lists these
 * so a form can ride along with particular visit types only (ML-27).
 */
export async function getClinicVisitTypes(organizationId: string): Promise<VisitType[]> {
  const [profile] = await db
    .select({ visitTypeSettings: schema.clinicProfile.visitTypeSettings })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  return resolveVisitTypes(profile?.visitTypeSettings ?? null)
}
