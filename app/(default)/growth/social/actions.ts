'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { createSocialPost, deleteSocialPost, retrySocialPostTargets } from '@/lib/services/social-posts'
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
      revalidatePath('/growth/social')
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
      revalidatePath('/growth/social')
      return { ok: true }
    }
    return { ok: false, error: result.error }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Try again on the channels that failed (2026-10-26) — the lever the Social
 * page's legend had promised. Same gate as delete; the service touches ONLY
 * the failed targets, so a channel that already posted can never post twice.
 */
export async function retrySocialPostAction(
  postId: string,
): Promise<{ ok: boolean; recovered?: number; retried?: number; error?: string }> {
  try {
    const ctx = await requireTenant()
    ensureSocialPostAdmin(ctx)
    const result = await retrySocialPostTargets(ctx.organizationId, postId)
    // The rows moved either way (an error sentence is a change too).
    revalidatePath('/growth/social')
    if (result.ok) return { ok: true, recovered: result.recovered, retried: result.retried }
    return { ok: false, retried: result.retried, recovered: result.recovered, error: result.error }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Re-pull the org's connected Zernio accounts (all platforms) and persist them,
 * then refresh /growth/social. The in-place Connect-channels cards call this on
 * window focus after a connect attempt + via a Refresh button, so a connection
 * completed on the platform's own page (Zernio's default return target) is
 * detected when the clinic tabs back here — without sending them to
 * /integrations. Demo-safe (the service short-circuits on a demo connection).
 */
export async function refreshChannelsAction(): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireTenant()
    ensureSocialPostAdmin(ctx)
    const { syncConnectedAccounts } = await import('@/lib/services/zernio')
    await syncConnectedAccounts(ctx.organizationId)
    revalidatePath('/growth/social')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
