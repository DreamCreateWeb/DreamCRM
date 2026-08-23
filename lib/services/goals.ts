import 'server-only'

/**
 * THE DREAM TEAM's GOALS — server half (docs/ai-operations.md, D6).
 *
 * Thin by design: goals are read constantly (every generator tick, every
 * Dream Team render) and written rarely. `goalPromptLineFor` is the hot
 * path — it must never throw into a generator, because a goal read failing
 * should cost the practice its goal FLAVOR for one tick, never its work.
 */

import { and, count, desc, eq, gte, isNotNull, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId, slugify } from '@/lib/utils'
import { recordAction } from '@/lib/services/action-ledger'
import { BACKFILL_PATIENT_SOURCES } from '@/lib/patient-acquisition'
import {
  MAX_ACTIVE_GOALS,
  goalPromptLine,
  matchServiceFocus,
  isGoalStatus,
  validateObjective,
  type GoalStatus,
  type GoalView,
} from '@/lib/goals'

function toView(row: typeof schema.goal.$inferSelect): GoalView {
  return {
    id: row.id,
    objective: row.objective,
    serviceFocus: row.serviceFocus,
    status: isGoalStatus(row.status) ? row.status : 'retired',
    baselineNewPatients: row.baselineNewPatients,
    baselineAt: row.baselineAt,
    createdAt: row.createdAt,
  }
}

/** Every goal, newest first (the Dream Team page shows active ones and keeps
 *  the rest out of the way). */
export async function listGoals(organizationId: string): Promise<GoalView[]> {
  const rows = await db
    .select()
    .from(schema.goal)
    .where(eq(schema.goal.organizationId, organizationId))
    .orderBy(desc(schema.goal.createdAt))
    .limit(50)
  return rows.map(toView)
}

export async function listActiveGoals(organizationId: string): Promise<GoalView[]> {
  const rows = await db
    .select()
    .from(schema.goal)
    .where(and(eq(schema.goal.organizationId, organizationId), eq(schema.goal.status, 'active')))
    .orderBy(desc(schema.goal.createdAt))
    .limit(MAX_ACTIVE_GOALS)
  return rows.map(toView)
}

/**
 * THE HOT PATH: the ancestry line a generator appends to its prompt. Never
 * throws — a failed read means this tick's work is un-flavored, which is
 * exactly today's behavior, not an outage.
 */
export async function goalPromptLineFor(organizationId: string): Promise<string> {
  try {
    return goalPromptLine(await listActiveGoals(organizationId))
  } catch {
    return ''
  }
}

/**
 * New patients SEATED since an instant — the goal's honest progress number.
 *
 * SAME ACQUISITION SEMANTICS as Analytics and the Overview tile, and for the
 * same reasons: `firstSeenAt` is the honest field (the journey law: seated,
 * never booked), archived patients don't count, and BULK BACKFILLS are
 * excluded. That last one is not a nicety here — a practice that connects
 * their PMS the week after setting a goal would otherwise open this card to
 * "1,800 new patients seated in the last 3 days", which is precisely the
 * kind of claim the card's own caption promises it is not making.
 */
export async function seatedSince(organizationId: string, since: Date): Promise<number> {
  const rows = await db
    .select({ source: schema.patient.source })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        isNotNull(schema.patient.firstSeenAt),
        gte(schema.patient.firstSeenAt, since),
        ne(schema.patient.lifecycle, 'archived'),
      ),
    )
  return rows.filter((r) => !BACKFILL_PATIENT_SOURCES.has(r.source ?? '')).length
}

/**
 * THE GOAL'S SERVICE, UNDERSTOOD (D7c): read the practice's own service list
 * and let `matchServiceFocus` decide. Best-effort by construction — an
 * unreadable profile costs the goal its service focus, never its existence.
 */
async function deriveServiceFocus(organizationId: string, objective: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ services: schema.clinicProfile.services })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    const raw = Array.isArray(row?.services) ? (row!.services as unknown[]) : []
    const services = raw
      .map((s) => {
        if (!s || typeof s !== 'object') return null
        const o = s as Record<string, unknown>
        const name = typeof o.name === 'string' ? o.name : ''
        if (!name.trim()) return null
        const slug = typeof o.librarySlug === 'string' && o.librarySlug ? o.librarySlug : slugify(name)
        return { name, slug }
      })
      .filter((x): x is { name: string; slug: string } => x !== null)
    return matchServiceFocus(objective, services)
  } catch {
    return null
  }
}

export interface SetGoalResult {
  ok: boolean
  error?: string
  goalId?: string
}

export async function createGoal(input: {
  organizationId: string
  userId: string | null
  objective: string
  serviceFocus?: string | null
  isDemo?: boolean
  now?: Date
}): Promise<SetGoalResult> {
  const v = validateObjective(input.objective)
  if (!v.ok) return { ok: false, error: v.error }
  const now = input.now ?? new Date()

  const [{ n: activeCount } = { n: 0 }] = await db
    .select({ n: count() })
    .from(schema.goal)
    .where(and(eq(schema.goal.organizationId, input.organizationId), eq(schema.goal.status, 'active')))
  if (activeCount >= MAX_ACTIVE_GOALS) {
    return {
      ok: false,
      error: `You can run ${MAX_ACTIVE_GOALS} goals at once — pause one first so the team stays pointed.`,
    }
  }

  const id = newId('goal')
  // A caller-supplied focus wins (the demo seeder names one); otherwise the
  // team works out which of the practice's OWN services the goal is about,
  // rather than making a person pick it twice.
  const serviceFocus =
    input.serviceFocus?.trim() || (await deriveServiceFocus(input.organizationId, v.objective))
  await db.insert(schema.goal).values({
    id,
    organizationId: input.organizationId,
    objective: v.objective,
    serviceFocus,
    status: 'active',
    createdByUserId: input.userId,
    // THE BASELINE IS ZERO-AT-NOW, not a historical count: progress means
    // "seated since you set this", so the comparison instant is what we
    // store and the counter starts here. A goal set mid-month must never
    // claim credit for the weeks before it existed.
    baselineNewPatients: 0,
    baselineAt: now,
    isDemo: input.isDemo ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  })

  // The team's own diary records the instruction it was given — the goal is
  // part of the practice's story, not a hidden setting.
  await recordAction({
    organizationId: input.organizationId,
    capability: 'proposal_engine',
    summary: `You set a goal: ${v.objective}`,
    detail: { goalId: id, goalChange: 'set' },
  }).catch(() => undefined)

  return { ok: true, goalId: id }
}

export async function setGoalStatus(
  organizationId: string,
  goalId: string,
  status: GoalStatus,
  now: Date = new Date(),
): Promise<SetGoalResult> {
  const [row] = await db
    .select()
    .from(schema.goal)
    .where(and(eq(schema.goal.organizationId, organizationId), eq(schema.goal.id, goalId)))
    .limit(1)
  if (!row) return { ok: false, error: 'That goal is no longer here.' }
  if (row.status === status) return { ok: true, goalId }

  if (status === 'active') {
    const [{ n: activeCount } = { n: 0 }] = await db
      .select({ n: count() })
      .from(schema.goal)
      .where(and(eq(schema.goal.organizationId, organizationId), eq(schema.goal.status, 'active')))
    if (activeCount >= MAX_ACTIVE_GOALS) {
      return { ok: false, error: `Pause one of your ${MAX_ACTIVE_GOALS} goals first.` }
    }
  }

  await db
    .update(schema.goal)
    .set({
      status,
      updatedAt: now,
      // RESUMING RE-BASELINES (the honesty rule): a goal paused for a month
      // must not resume and claim the patients seated while it slept.
      ...(status === 'active' && row.status !== 'active' ? { baselineAt: now } : {}),
    })
    .where(and(eq(schema.goal.organizationId, organizationId), eq(schema.goal.id, goalId)))

  const verb =
    status === 'achieved'
      ? 'marked as reached'
      : status === 'paused'
        ? 'paused'
        : status === 'retired'
          ? 'put away'
          : 'started again'
  await recordAction({
    organizationId,
    capability: 'proposal_engine',
    summary: `Your goal “${row.objective}” was ${verb}`,
    detail: { goalId, goalChange: status },
  }).catch(() => undefined)

  return { ok: true, goalId }
}
