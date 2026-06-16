'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { createSocialPost, deleteSocialPost } from '@/lib/services/social-posts'
import type { CreateSocialPostFormInput } from '@/lib/types/zernio'

/**
 * Server actions for the unified Social Posts surface. Each re-gates clinic +
 * owner/admin — on ANY plan (the page is gated the same, but actions must
 * self-gate against a deep-link). Posting to a channel requires it to be
 * connected (the social-connection cap is enforced at connect-time on
 * /integrations), so there is NO plan gate here beyond clinic + owner/admin.
 * Returns the `{ ok | error }` convention so the composer can surface inline.
 */
function ensureSocialPostAdmin(ctx: { tenantType: string; role: string }) {
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Social Posts is only available for clinic tenants.')
  }
  if (ctx.role === 'patient' || ctx.role === 'member') {
    throw new Error('Only an owner or admin can publish posts.')
  }
}

export interface CreatePostActionResult {
  ok: boolean
  status?: string
  error?: string
}

export async function createSocialPostAction(input: CreateSocialPostFormInput): Promise<CreatePostActionResult> {
  try {
    const ctx = await requireTenant()
    ensureSocialPostAdmin(ctx)
    const result = await createSocialPost(ctx.organizationId, input)
    if (result.ok) {
      revalidatePath('/social-posts')
      return { ok: true, status: result.status }
    }
    return { ok: false, error: result.error }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function deleteSocialPostAction(postId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireTenant()
    ensureSocialPostAdmin(ctx)
    const result = await deleteSocialPost(ctx.organizationId, postId)
    if (result.ok) {
      revalidatePath('/social-posts')
      return { ok: true }
    }
    return { ok: false, error: result.error }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
