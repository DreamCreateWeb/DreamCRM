import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import {
  ACTIVATION_TASK_DEFS,
  type ActivationChecklist,
  type ActivationTask,
} from '@/lib/types/onboarding'
import type { PlanTier } from '@/lib/modules/types'

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

const PLAN_ORDER: PlanTier[] = ['basic', 'pro', 'premium']

function planAtLeast(plan: PlanTier, min: PlanTier | undefined): boolean {
  if (!min) return true
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(min)
}

async function exists(query: Promise<Array<unknown>>): Promise<boolean> {
  return (await query).length > 0
}

/**
 * Build the Getting-started checklist from live org data. Each check is a
 * cheap LIMIT-1 select; the whole thing runs in parallel and only on the
 * Overview page while the checklist is still showing.
 */
export async function getActivationChecklist(
  organizationId: string,
  planTier: PlanTier,
): Promise<ActivationChecklist> {
  const [profileRow] = await db
    .select({
      logoUrl: schema.clinicProfile.logoUrl,
      heroImageUrl: schema.clinicProfile.heroImageUrl,
      staff: schema.clinicProfile.staff,
      hours: schema.clinicProfile.hours,
      portalSettings: schema.clinicProfile.portalSettings,
      tagline: schema.clinicProfile.tagline,
      about: schema.clinicProfile.about,
      services: schema.clinicProfile.services,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)

  const [
    hasPatient,
    hasInbox,
    hasReviewConfig,
    hasPms,
    hasProduct,
    memberCountRow,
  ] = await Promise.all([
    exists(
      db
        .select({ id: schema.patient.id })
        .from(schema.patient)
        .where(eq(schema.patient.organizationId, organizationId))
        .limit(1),
    ),
    exists(
      db
        .select({ id: schema.emailAccount.id })
        .from(schema.emailAccount)
        .where(eq(schema.emailAccount.organizationId, organizationId))
        .limit(1),
    ),
    exists(
      db
        .select({ id: schema.clinicReviewConfig.organizationId })
        .from(schema.clinicReviewConfig)
        .where(eq(schema.clinicReviewConfig.organizationId, organizationId))
        .limit(1),
    ),
    exists(
      db
        .select({ id: schema.pmsConnection.organizationId })
        .from(schema.pmsConnection)
        .where(eq(schema.pmsConnection.organizationId, organizationId))
        .limit(1),
    ),
    exists(
      db
        .select({ id: schema.shopProduct.id })
        .from(schema.shopProduct)
        .where(eq(schema.shopProduct.organizationId, organizationId))
        .limit(1),
    ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.member)
      .where(eq(schema.member.organizationId, organizationId)),
  ])

  const staffArr = Array.isArray(profileRow?.staff) ? (profileRow!.staff as unknown[]) : []
  const memberCount = Number(memberCountRow[0]?.count ?? 0)

  const doneById: Record<string, boolean> = {
    brand_website: Boolean(profileRow?.logoUrl || profileRow?.heroImageUrl),
    add_team: staffArr.length > 0,
    set_hours: profileRow?.hours != null,
    invite_team: memberCount > 1,
    add_patients: hasPatient,
    connect_inbox: hasInbox,
    portal_setup: profileRow?.portalSettings != null,
    reviews_setup: hasReviewConfig,
    connect_pms: hasPms,
    open_shop: hasProduct,
  }

  const tasks: ActivationTask[] = ACTIVATION_TASK_DEFS.filter((t) =>
    planAtLeast(planTier, t.minPlan),
  ).map((t) => ({
    id: t.id,
    label: t.label,
    body: t.body,
    href: t.href,
    done: doneById[t.id] ?? false,
  }))

  const doneCount = tasks.filter((t) => t.done).length

  // The public site is "unfilled" when it has none of the three content
  // signals the AI interview drafts (tagline / about / services). Used to
  // surface the one-tap "Draft my website with AI" re-entry to /welcome.
  const servicesArr = Array.isArray(profileRow?.services) ? (profileRow!.services as unknown[]) : []
  const siteUnfilled =
    !profileRow?.tagline?.trim() && !profileRow?.about?.trim() && servicesArr.length === 0

  return {
    tasks,
    doneCount,
    totalCount: tasks.length,
    allDone: doneCount === tasks.length,
    siteUnfilled,
  }
}
