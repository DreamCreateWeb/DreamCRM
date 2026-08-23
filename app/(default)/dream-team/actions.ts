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

export interface SandmanChatResult {
  ok: boolean
  answer: string
  actions: Array<{ kind: string; label: string; href: string }>
}

/**
 * SANDMAN's one action (D5): ask a question, get a grounded answer plus
 * NAVIGATION suggestions. It never mutates — the returned actions are hrefs
 * the human clicks, resolved server-side from the closed registry so a
 * model-invented kind can never become a link.
 */
export async function askSandmanAction(input: {
  query: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<SandmanChatResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return { ok: false, answer: 'Sandman works for clinics.', actions: [] }
  }
  const query = (input.query ?? '').trim()
  if (!query) return { ok: false, answer: 'Ask me something about the practice.', actions: [] }

  const { askSandman } = await import('@/lib/services/sandman')
  const { SANDMAN_ACTIONS } = await import('@/lib/sandman')
  // Only the last few turns travel — the prompt clamps too, but the wire
  // should not carry an unbounded transcript from a client we do not trust.
  const history = (input.history ?? [])
    .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
    .slice(-6)
  const res = await askSandman(ctx.organizationId, ctx.organizationName, query, history)
  return {
    ok: true,
    answer: res.answer,
    actions: res.actions.map((a) => ({
      kind: a.kind,
      label: a.label,
      href: SANDMAN_ACTIONS[a.kind].href,
    })),
  }
}
