'use server'

/**
 * THE VETO RUNWAY's one action (docs/ai-operations.md, D4): Stop something
 * before it goes out. Stops call the OWNING rail's own function — the
 * runway never grows a second write path.
 */

import { requireTenant } from '@/lib/auth/context'

export interface StopResult {
  ok: boolean
  message: string
}

export async function stopRunwayItemAction(input: {
  kind: 'social' | 'blog'
  id: string
}): Promise<StopResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return { ok: false, message: 'Only clinic staff can stop queued work.' }
  }
  // Any staff member may pull the cord — the veto window is only honest if
  // the person who spots a problem can act on it, and stopping is the safe
  // direction (nothing ships that shouldn't; the machine drafts again).
  const id = input.id?.trim()
  if (!id || id.length > 64) return { ok: false, message: 'That item is no longer queued.' }

  if (input.kind === 'social') {
    const { deleteSocialPost } = await import('@/lib/services/social-posts')
    const r = await deleteSocialPost(ctx.organizationId, id)
    return r.ok
      ? { ok: true, message: 'Stopped — the post won’t go out.' }
      : { ok: false, message: r.error }
  }
  if (input.kind === 'blog') {
    const { unscheduleBlogPost } = await import('@/lib/services/blog')
    const post = await unscheduleBlogPost(ctx.organizationId, id)
    return post
      ? { ok: true, message: 'Stopped — the article is back in your drafts.' }
      : { ok: false, message: 'That article is no longer queued.' }
  }
  return { ok: false, message: 'That item is no longer queued.' }
}
