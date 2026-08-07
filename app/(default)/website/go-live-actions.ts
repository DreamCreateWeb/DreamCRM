'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { requireTenant } from '@/lib/auth/context'

/**
 * THE GO-LIVE LEVER's two actions (onboarding overhaul, owner ruling: "one
 * big lever"). Pulling it stamps `site_live_at`; the public site (including
 * /book) serves for real from the next request. Taking the site offline
 * clears it — reversible on purpose, because a lever that can't be
 * un-pulled is a trap, and "we found a problem, hide the site while we fix
 * it" is a legitimate ask.
 *
 * Deliberately NOT narrated in the Action Ledger: the ledger is the
 * machine's work stream, and this is a human decision. The hub's own state
 * ("Live since …") is the record.
 */

export type GoLiveResult = { ok: true } | { ok: false; error: string }

async function gate(): Promise<
  { ok: true; organizationId: string; slug: string } | { ok: false; error: string }
> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinics have a public site' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can change whether the site is live' }
  }
  return { ok: true, organizationId: ctx.organizationId, slug: ctx.organizationSlug }
}

function revalidateSite(slug: string) {
  revalidatePath('/website')
  revalidatePath('/dashboard')
  revalidatePath(`/site/${slug}`, 'layout')
}

export async function goLiveAction(): Promise<GoLiveResult> {
  const g = await gate()
  if (!g.ok) return g
  try {
    await db
      .update(clinicProfile)
      .set({ siteLiveAt: new Date(), updatedAt: new Date() })
      .where(eq(clinicProfile.organizationId, g.organizationId))
    revalidateSite(g.slug)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not take the site live — try again' }
  }
}

export async function takeSiteOfflineAction(): Promise<GoLiveResult> {
  const g = await gate()
  if (!g.ok) return g
  try {
    await db
      .update(clinicProfile)
      .set({ siteLiveAt: null, updatedAt: new Date() })
      .where(eq(clinicProfile.organizationId, g.organizationId))
    revalidateSite(g.slug)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not take the site offline — try again' }
  }
}
