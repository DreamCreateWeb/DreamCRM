'use server'

import { requireTenant } from '@/lib/auth/context'
import {
  getPostEngagementBundle,
  replyToPostCommentSvc,
  deletePostCommentSvc,
  setPostCommentHiddenSvc,
  setPostCommentLikedSvc,
} from '@/lib/services/social-comments'
import type { PostEngagementBundle } from '@/lib/types/zernio'

/**
 * Server actions for the post-detail comment surface on the Social Posts tablet
 * feed. Read + manage are owner/admin on a clinic tenant (same gate as posting).
 * Each returns the `{ ok | error }` convention; mutations leave the panel to
 * reload the thread itself (no path revalidation — it's a self-contained widget).
 */
function ensureManager(ctx: { tenantType: string; role: string }) {
  if (ctx.tenantType !== 'clinic') throw new Error('Social Posts is only available for clinic tenants.')
  if (ctx.role === 'patient' || ctx.role === 'member') throw new Error('Only an owner or admin can manage comments.')
}

export async function loadPostEngagementAction(
  socialPostId: string,
  platform: string,
): Promise<{ ok: true; bundle: PostEngagementBundle } | { ok: false; error: string }> {
  try {
    const ctx = await requireTenant()
    ensureManager(ctx)
    const bundle = await getPostEngagementBundle(ctx.organizationId, socialPostId, platform)
    return { ok: true, bundle }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function replyToCommentAction(
  socialPostId: string,
  platform: string,
  message: string,
  commentId?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireTenant()
    ensureManager(ctx)
    return await replyToPostCommentSvc(ctx.organizationId, socialPostId, platform, message, commentId)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function deleteCommentAction(
  socialPostId: string,
  platform: string,
  commentId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireTenant()
    ensureManager(ctx)
    return await deletePostCommentSvc(ctx.organizationId, socialPostId, platform, commentId)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function setCommentHiddenAction(
  socialPostId: string,
  platform: string,
  commentId: string,
  hidden: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireTenant()
    ensureManager(ctx)
    return await setPostCommentHiddenSvc(ctx.organizationId, socialPostId, platform, commentId, hidden)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function setCommentLikedAction(
  socialPostId: string,
  platform: string,
  commentId: string,
  liked: boolean,
  opts?: { cid?: string | null; likeUri?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireTenant()
    ensureManager(ctx)
    return await setPostCommentLikedSvc(ctx.organizationId, socialPostId, platform, commentId, liked, opts)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
