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

/**
 * Words too generic to identify a service. "Dental care" and "family
 * dentistry" describe almost every service a practice offers, so matching on
 * them would aim a goal at whichever service happened to sort first.
 */
const GENERIC_SERVICE_WORDS = new Set([
  'dental',
  'dentistry',
  'dentist',
  'care',
  'general',
  'service',
  'services',
  'treatment',
  'treatments',
  'family',
  'patient',
  'patients',
  'more',
  'new',
  'your',
  'our',
  'the',
  'and',
  'for',
])

/** Crude singular/plural fold — "implants" and "implant" are the same word
 *  to a person, and a goal is typed by a person. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.length > 3 && word.endsWith('es')) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1)
  return word
}

function distinctiveTokens(text: string): string[] {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 4 && !GENERIC_SERVICE_WORDS.has(w))
    .map(stem)
}

/**
 * THE GOAL'S SERVICE, UNDERSTOOD RATHER THAN ASKED FOR (D7c).
 *
 * "More implant patients" is already the answer to "which service?" — making
 * someone pick it again from a dropdown is the tool asking the employee to
 * operate it. So the goal's service focus is DERIVED by matching what they
 * typed against the practice's OWN service list, which means a match can
 * only ever be a service they actually offer.
 *
 * Pure, and honest about uncertainty: no confident match returns null, and a
 * null focus simply means the ancestry line names the goal without a service.
 */
export function matchServiceFocus(
  objective: string,
  services: Array<{ name: string; slug: string }>,
): string | null {
  const objTokens = new Set(distinctiveTokens(objective))
  if (objTokens.size === 0) return null
  let best: { slug: string; matched: number; ratio: number } | null = null
  for (const svc of services) {
    const tokens = distinctiveTokens(svc.name)
    if (tokens.length === 0) continue
    const matched = tokens.filter((t) => objTokens.has(t)).length
    if (matched === 0) continue
    const ratio = matched / tokens.length
    if (
      !best ||
      matched > best.matched ||
      (matched === best.matched && ratio > best.ratio)
    ) {
      best = { slug: svc.slug, matched, ratio }
    }
  }
  return best?.slug ?? null
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
