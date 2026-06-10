import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import {
  resolvePortalSettings,
  type PortalSettings,
} from '@/lib/types/portal'

/**
 * Patient-portal settings CRUD. The stored value is a partial blob merged
 * over DEFAULT_PORTAL_SETTINGS on read, so reads always return a complete
 * PortalSettings regardless of when the row was last written.
 */

export async function getPortalSettings(organizationId: string): Promise<PortalSettings> {
  const [row] = await db
    .select({ portalSettings: clinicProfile.portalSettings })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  return resolvePortalSettings(row?.portalSettings ?? null)
}

/**
 * Persist a full settings object (the settings form always submits the
 * complete shape). Run through the resolver first so junk values are
 * dropped before they hit the column.
 */
export async function updatePortalSettings(
  organizationId: string,
  settings: PortalSettings,
): Promise<PortalSettings> {
  const cleaned = resolvePortalSettings(settings)
  await db
    .update(clinicProfile)
    .set({ portalSettings: cleaned, updatedAt: new Date() })
    .where(eq(clinicProfile.organizationId, organizationId))
  return cleaned
}
