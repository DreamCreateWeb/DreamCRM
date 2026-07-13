'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { requireTenant } from '@/lib/auth/context'
import { publishRealtime } from '@/lib/services/realtime'

type Result = { ok: true } | { ok: false; error: string }

/** owner/admin gate, clinic tenant only — mirrors the practice-settings gate. */
async function requireWebsiteAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Only clinic tenants can edit website settings')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Only owners and admins can edit website settings')
  }
  return ctx
}

/** Toggle the public-site "Message us" chat bubble. Default ON; a visitor's
 *  message lands as an inbound thread in /messages (reply goes out by email).
 *  Lives here because its ONLY control is on Website → Forms (moved from the
 *  practice settings actions in the structure pass). */
export async function saveChatWidgetAction(enabled: boolean): Promise<Result> {
  const ctx = await requireWebsiteAdmin()
  try {
    await db
      .update(clinicProfile)
      .set({ chatWidgetEnabled: Boolean(enabled), updatedAt: new Date() })
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
    revalidatePath('/website/forms')
    // The bubble renders on every public page — repaint the whole site subtree.
    revalidatePath(`/site/${ctx.organizationSlug}`, 'layout')
    await publishRealtime(ctx.organizationId, 'settings', { section: 'practice' })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save chat setting' }
  }
}
