'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant, requirePlan } from '@/lib/auth/context'
import { updateSeoMeta } from '@/lib/services/site-analytics'
import { resolveSeoMeta, type PageSeoMeta } from '@/lib/types/seo-meta'

export type SaveSeoMetaResult = { ok: true } | { ok: false; error: string }

/**
 * Persist the clinic's per-page Search-appearance overrides. Owner/admin only,
 * Pro+ (matches the SEO module tier). The resolver clamps + drops junk before
 * it hits the column, and the public pages fall back to derived metadata for
 * any key left blank.
 */
export async function saveSeoMetaAction(raw: unknown): Promise<SaveSeoMetaResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinics can edit search appearance.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can change search appearance.' }
  }
  // Gate to the SEO module's tier so the save can't be POSTed past the UI gate.
  await requirePlan(ctx, 'pro', 'seo')

  const cleaned: PageSeoMeta = resolveSeoMeta(raw)
  await updateSeoMeta(ctx.organizationId, cleaned)

  revalidatePath('/website/seo')
  return { ok: true }
}
