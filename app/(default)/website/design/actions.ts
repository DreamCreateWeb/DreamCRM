'use server'

import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { invalidateClinicSiteEverywhere } from '@/lib/services/clinic-site-cache'

/**
 * The "Powered by DreamCRM" site-credit switch (owner ruling 2026-08-26,
 * docs/marketing-engine.md). LIVE-INSTANT on purpose — it is a platform-loop
 * setting, not site content, so it does not ride the website draft (staging
 * "remove the credit" behind Publish would be a strange promise).
 */
export async function setPoweredByVisibilityAction(
  hidden: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic' || (ctx.role !== 'owner' && ctx.role !== 'admin')) {
    return { ok: false, error: 'Only an owner or admin can change this.' }
  }
  try {
    await db
      .update(clinicProfile)
      .set({ hidePoweredBy: hidden === true, updatedAt: new Date() })
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
    // The credit renders in the public site LAYOUT, whose chrome is cached
    // per clinic — without this the clinic flips the switch, reloads their
    // own site and still sees it for up to the TTL, with nothing saying why.
    invalidateClinicSiteEverywhere(ctx.organizationId, ctx.organizationSlug)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not save that — try again.' }
  }
}
