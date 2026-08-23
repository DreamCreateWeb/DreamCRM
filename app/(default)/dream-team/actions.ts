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
  /** Work the person can ASK the team to draft (D8). Labels are ours. */
  requests: Array<{ kind: string; label: string }>
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
    return { ok: false, answer: 'Sandman works for clinics.', actions: [], requests: [] }
  }
  const query = (input.query ?? '').trim()
  if (!query) return { ok: false, answer: 'Ask me something about the practice.', actions: [], requests: [] }

  const { askSandman } = await import('@/lib/services/sandman')
  const { SANDMAN_ACTIONS, SANDMAN_REQUESTS } = await import('@/lib/sandman')
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
    requests: res.requests.map((q) => ({ kind: q.kind, label: SANDMAN_REQUESTS[q.kind].label })),
  }
}

export interface TeamRequestResult {
  ok: boolean
  message: string
}

/**
 * PUTTING THE TEAM TO WORK (D8) — the owner's "then initiate a task".
 *
 * Safe for exactly one reason: this runs an EXISTING generator now, and a
 * generator's output is a DRAFT that lands in the sign-here stack needing a
 * human yes. Nothing here shortens the approval path. The wire carries only
 * a KIND from a closed registry — no content, no audience, no recipient —
 * so there is nothing in the request for a bad answer to steer.
 *
 * Every generator keeps its own guards (stand-downs, sourceKey dedupe,
 * skip-when-AI-is-off), so a second tap cannot mint a second card and a tap
 * at a bad moment produces none. That is why "nothing to draft" is a normal,
 * honest outcome rather than a failure.
 */
export async function askTeamForWorkAction(input: { kind: string }): Promise<TeamRequestResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return { ok: false, message: 'Only clinic staff can put the team to work.' }
  }
  if (ctx.role === 'patient') {
    return { ok: false, message: 'Only clinic staff can put the team to work.' }
  }
  const { SANDMAN_REQUESTS } = await import('@/lib/sandman')
  const kind = input.kind
  if (typeof kind !== 'string' || !(kind in SANDMAN_REQUESTS)) {
    return { ok: false, message: 'I can’t do that one.' }
  }
  const { runSandmanRequest } = await import('@/lib/services/sandman-requests')
  return runSandmanRequest(ctx.organizationId, ctx.organizationName, kind as keyof typeof SANDMAN_REQUESTS)
}

export interface GoalActionResult {
  ok: boolean
  message: string
}

/** Set a goal — "more implant patients". Owner/admin only: a goal points the
 *  whole team, which is a direction decision, not a daily task. */
export async function createGoalAction(input: {
  objective: string
  serviceFocus?: string | null
}): Promise<GoalActionResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, message: 'Goals belong to a clinic.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, message: 'Ask an owner or admin to set the practice’s goal.' }
  }
  const { createGoal } = await import('@/lib/services/goals')
  const r = await createGoal({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    objective: input.objective ?? '',
    serviceFocus: input.serviceFocus ?? null,
    isDemo: ctx.isDemo,
  })
  return r.ok
    ? { ok: true, message: 'Goal set — the team will aim its work here.' }
    : { ok: false, message: r.error ?? 'That didn’t save.' }
}

export async function setGoalStatusAction(input: {
  goalId: string
  status: string
}): Promise<GoalActionResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, message: 'Goals belong to a clinic.' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, message: 'Ask an owner or admin to change the practice’s goal.' }
  }
  const { isGoalStatus } = await import('@/lib/goals')
  if (!isGoalStatus(input.status)) return { ok: false, message: 'That isn’t a goal state.' }
  const { setGoalStatus } = await import('@/lib/services/goals')
  const r = await setGoalStatus(ctx.organizationId, input.goalId, input.status)
  if (!r.ok) return { ok: false, message: r.error ?? 'That didn’t save.' }
  const said =
    input.status === 'achieved'
      ? 'Nice — marked as reached.'
      : input.status === 'paused'
        ? 'Paused — the team stops aiming here.'
        : input.status === 'retired'
          ? 'Put away.'
          : 'Back on — the team aims here again.'
  return { ok: true, message: said }
}
