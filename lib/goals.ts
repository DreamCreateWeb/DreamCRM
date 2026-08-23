/**
 * THE DREAM TEAM's GOALS — pure core (docs/ai-operations.md, D6).
 *
 * A goal is one durable objective in the practice's own words ("more implant
 * patients"). It queues nothing; it FLAVORS everything: each generator reads
 * the active goals and aims its draft, its audience, and its copy there.
 *
 * Pure (no server-only deps) so the intake form, the generators' prompt
 * builders, and the tests share one contract.
 */

export const GOAL_STATUSES = ['active', 'paused', 'achieved', 'retired'] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

/** How many goals may be ACTIVE at once. Few on purpose: a team pulling in
 *  six directions pulls in none, and every generator's context window pays
 *  for each one. */
export const MAX_ACTIVE_GOALS = 3

export const OBJECTIVE_MAX = 120

export interface GoalView {
  id: string
  objective: string
  serviceFocus: string | null
  status: GoalStatus
  baselineNewPatients: number
  baselineAt: Date
  createdAt: Date
}

/** Normalize + validate what a person typed. Returns the trimmed objective
 *  or a plain-English complaint — never throws. */
export function validateObjective(raw: string): { ok: true; objective: string } | { ok: false; error: string } {
  const objective = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (objective.length === 0) return { ok: false, error: 'Tell me what you want more of.' }
  if (objective.length > OBJECTIVE_MAX) {
    return { ok: false, error: `Keep it under ${OBJECTIVE_MAX} characters — a goal, not a plan.` }
  }
  return { ok: true, objective }
}

export function isGoalStatus(v: unknown): v is GoalStatus {
  return typeof v === 'string' && (GOAL_STATUSES as readonly string[]).includes(v)
}

/**
 * THE ANCESTRY LINE (the piece borrowed from Paperclip's goal ancestry): the
 * sentence every generator appends to its own system prompt so the work it
 * drafts aims at what the practice asked for.
 *
 * Deliberately a SUGGESTION, not a command: a goal must never override the
 * generator's own rules (never invent an offer, never claim a credential),
 * and a post that ignores the goal is better than one that invents a service
 * the practice doesn't provide. Returns '' when nothing is active — the
 * no-goal path must be byte-identical to today's behavior.
 */
export function goalPromptLine(goals: Array<Pick<GoalView, 'objective' | 'serviceFocus'>>): string {
  const active = goals.filter((g) => g.objective.trim().length > 0).slice(0, MAX_ACTIVE_GOALS)
  if (active.length === 0) return ''
  const list = active
    .map((g) => (g.serviceFocus ? `${g.objective} (their "${g.serviceFocus}" service)` : g.objective))
    .join('; ')
  return [
    '',
    `THE PRACTICE'S GOAL RIGHT NOW: ${list}.`,
    'Where it fits NATURALLY, aim this piece there — the angle, the example, the invitation.',
    'Never invent a service, offer, price, or credential to serve the goal, and never force it: a good general piece beats a strained one.',
  ].join('\n')
}

/** The honest progress line for a goal card. New patients SEATED since the
 *  goal was set, and how long it has been running — never a projection, and
 *  never a claim that the goal CAUSED them. */
export function goalProgressLine(
  goal: Pick<GoalView, 'baselineNewPatients' | 'baselineAt'>,
  seatedNow: number,
  now: Date = new Date(),
): string {
  const since = Math.max(0, seatedNow - goal.baselineNewPatients)
  const days = Math.max(0, Math.floor((now.getTime() - goal.baselineAt.getTime()) / (24 * 60 * 60 * 1000)))
  const window = days < 1 ? 'today' : days === 1 ? 'in the last day' : `in the last ${days} days`
  if (since === 0) {
    return days < 7
      ? `No new patients seated yet ${window} — early days.`
      : `No new patients seated ${window} yet.`
  }
  return `${since} new ${since === 1 ? 'patient' : 'patients'} seated ${window} since you set this.`
}
