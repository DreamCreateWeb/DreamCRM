import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import {
  ACTIVATION_TASK_DEFS,
  type ActivationChecklist,
  type ActivationTask,
} from '@/lib/types/onboarding'
import { getReadinessInput } from '@/lib/services/readiness'
import { resolveReadiness, type ReadinessFactId } from '@/lib/readiness'

/**
 * Staff tutorial state + the Getting-started activation checklist.
 *
 * State (welcome seen / checklist dismissed / hints dismissed) is per
 * (org, user). Checklist COMPLETION is never stored — each task derives
 * done/not-done from the org's real data, so the list always tells the
 * truth and ticks itself when work happens anywhere (including PMS sync).
 */

export interface StaffOnboardingState {
  welcomeSeen: boolean
  checklistDismissed: boolean
  dismissedHints: string[]
}

const DEFAULT_STATE: StaffOnboardingState = {
  welcomeSeen: false,
  checklistDismissed: false,
  dismissedHints: [],
}

export async function getStaffOnboarding(
  organizationId: string,
  userId: string,
): Promise<StaffOnboardingState> {
  const [row] = await db
    .select({
      welcomeSeenAt: schema.staffOnboarding.welcomeSeenAt,
      checklistDismissedAt: schema.staffOnboarding.checklistDismissedAt,
      dismissedHints: schema.staffOnboarding.dismissedHints,
    })
    .from(schema.staffOnboarding)
    .where(
      and(
        eq(schema.staffOnboarding.organizationId, organizationId),
        eq(schema.staffOnboarding.userId, userId),
      ),
    )
    .limit(1)
  if (!row) return { ...DEFAULT_STATE }
  return {
    welcomeSeen: !!row.welcomeSeenAt,
    checklistDismissed: !!row.checklistDismissedAt,
    dismissedHints: Array.isArray(row.dismissedHints) ? row.dismissedHints : [],
  }
}

type OnboardingPatch = Partial<{
  welcomeSeenAt: Date
  checklistDismissedAt: Date
  dismissedHints: string[]
}>

async function upsertOnboarding(
  organizationId: string,
  userId: string,
  patch: OnboardingPatch,
): Promise<void> {
  await db
    .insert(schema.staffOnboarding)
    .values({
      id: newId('sob'),
      organizationId,
      userId,
      ...patch,
    })
    .onConflictDoUpdate({
      target: [schema.staffOnboarding.organizationId, schema.staffOnboarding.userId],
      set: { ...patch, updatedAt: new Date() },
    })
}

export async function markWelcomeSeen(organizationId: string, userId: string): Promise<void> {
  await upsertOnboarding(organizationId, userId, { welcomeSeenAt: new Date() })
}

export async function dismissChecklist(organizationId: string, userId: string): Promise<void> {
  await upsertOnboarding(organizationId, userId, { checklistDismissedAt: new Date() })
}

export async function dismissHint(
  organizationId: string,
  userId: string,
  hintId: string,
): Promise<void> {
  const current = await getStaffOnboarding(organizationId, userId)
  if (current.dismissedHints.includes(hintId)) return
  await upsertOnboarding(organizationId, userId, {
    dismissedHints: [...current.dismissedHints, hintId],
  })
}

/* ── Activation checklist ───────────────────────────────────────────── */

/** Which readiness fact answers each activation task. The checklist keeps
 *  its task ids/copy (UI + tests unchanged) but every done/not-done now
 *  comes from the READINESS RESOLVER's health grades — the fixes this buys:
 *  a PMS connection in error no longer ticks "done", connecting Google
 *  Business no longer ticks "Connect your social channels", `{}` no longer
 *  counts as configured hours/portal. */
const TASK_FACT: Record<string, ReadinessFactId> = {
  brand_website: 'brand',
  add_team: 'site_team',
  set_hours: 'hours',
  invite_team: 'team',
  connect_social: 'social',
  add_patients: 'patients',
  connect_inbox: 'inbox',
  portal_setup: 'portal',
  reviews_setup: 'reviews',
  connect_pms: 'pms',
  open_shop: 'shop',
}

/**
 * Build the Getting-started checklist as a VIEW of the readiness resolver
 * (lib/readiness.ts) — one truth, this surface just formats it. Only runs
 * on the Overview page while the checklist is still showing.
 */
export async function getActivationChecklist(
  organizationId: string,
): Promise<ActivationChecklist> {
  const input = await getReadinessInput(organizationId)
  const report = input ? resolveReadiness(input) : null
  const byId = new Map(report?.facts.map((f) => [f.id, f]) ?? [])

  const tasks: ActivationTask[] = ACTIVATION_TASK_DEFS.map((t) => {
    const factId = TASK_FACT[t.id]
    const fact = factId ? byId.get(factId) : undefined
    // Only a healthy 'ready' ticks a task. 'waiting' (carrier queue, first
    // sync pending) isn't the clinic's move but isn't DONE either — the
    // fact's summary tells that story on richer surfaces.
    return {
      id: t.id,
      label: t.label,
      body: t.body,
      href: t.href,
      done: fact?.grade === 'ready',
    }
  })

  const doneCount = tasks.filter((t) => t.done).length

  return {
    tasks,
    doneCount,
    totalCount: tasks.length,
    allDone: doneCount === tasks.length,
    siteNeedsPersonalization: input?.personalizationNeeded ?? false,
  }
}
