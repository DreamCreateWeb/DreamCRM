'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { createGbpPost, deleteGbpPost } from '@/lib/services/gbp-posts'
import type { CreateGbpPostFormInput } from '@/lib/types/zernio'

/**
 * Server actions for the Google Posts surface. Each re-gates clinic + owner/
 * admin — on ANY plan (the page is gated the same, but actions must self-gate
 * against a deep-link). Google Business posting is part of the free GBP surface
 * on every tier (Basic included; see lib/types/social-entitlements.ts), so there
 * is NO plan gate. Returns the `{ ok | error }` convention so the composer can
 * surface inline.
 */
function ensureGbpAdmin(ctx: { tenantType: string; role: string }) {
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Google Posts is only available for clinic tenants.')
  }
  if (ctx.role === 'patient' || ctx.role === 'member') {
    throw new Error('Only an owner or admin can publish Google posts.')
  }
}

export interface CreatePostActionResult {
  ok: boolean
  status?: string
  error?: string
}

export async function createGbpPostAction(input: CreateGbpPostFormInput): Promise<CreatePostActionResult> {
  try {
    const ctx = await requireTenant()
    ensureGbpAdmin(ctx)
    const result = await createGbpPost(ctx.organizationId, input)
    if (result.ok) {
      revalidatePath('/google-posts')
      return { ok: true, status: result.status }
    }
    return { ok: false, error: result.error }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function deleteGbpPostAction(postId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireTenant()
    ensureGbpAdmin(ctx)
    const result = await deleteGbpPost(ctx.organizationId, postId)
    if (result.ok) {
      revalidatePath('/google-posts')
      return { ok: true }
    }
    return { ok: false, error: result.error }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
