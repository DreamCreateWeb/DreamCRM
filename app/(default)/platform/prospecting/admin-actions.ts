'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { requireTenant } from '@/lib/auth/context'
import { DEMO_CLINIC_SLUG } from '@/lib/services/demo-constants'
import { DEMO_SKIN_COOKIE, type DemoSkin } from '@/lib/types/demo-skin'
import { buildDemoSkin } from '@/lib/demo-skin-build'
import {
  getProspectingConfig,
  updateProspectingConfig,
  suppressProspect,
} from '@/lib/services/prospecting'
import { US_STATES } from '@/lib/types/us-geo'

async function requirePlatformAdmin() {
  const ctx = await requireTenant()
  if (!ctx.platformAdmin) throw new Error('Forbidden: platform admin only')
  return ctx
}

/** Flip the master kill switch (true = everything OFF). */
export async function setKillSwitchAction(on: boolean): Promise<void> {
  await requirePlatformAdmin()
  await updateProspectingConfig({ killSwitch: Boolean(on) })
  revalidatePath('/platform/prospecting')
  revalidatePath('/platform/prospecting/settings')
}

/** Toggle dry-run (true = personalize + log, never send). */
export async function setDryRunAction(on: boolean): Promise<void> {
  await requirePlatformAdmin()
  await updateProspectingConfig({ dryRun: Boolean(on) })
  revalidatePath('/platform/prospecting/settings')
}

const stateSchema = z.string().refine((s): s is (typeof US_STATES)[number] =>
  (US_STATES as readonly string[]).includes(s),
)

/** Enable/disable a state for discovery. Enabling seeds its zip3 task grid. */
export async function toggleStateAction(state: string, enabled: boolean): Promise<void> {
  await requirePlatformAdmin()
  const parsed = stateSchema.parse(state)
  const config = await getProspectingConfig()
  const set = new Set(config.enabledStates)
  if (enabled) set.add(parsed)
  else set.delete(parsed)
  await updateProspectingConfig({ enabledStates: Array.from(set).sort() })
  revalidatePath('/platform/prospecting')
  revalidatePath('/platform/prospecting/settings')
}

const warmupSchema = z.object({
  startPerDay: z.number().int().min(1).max(500),
  incrementPerWeek: z.number().int().min(0).max(200),
  ceilingPerDay: z.number().int().min(1).max(1000),
})

/** Update the warm-up ramp knobs (startedAt is managed by the send engine). */
export async function updateWarmupAction(input: unknown): Promise<void> {
  await requirePlatformAdmin()
  const parsed = warmupSchema.parse(input)
  const config = await getProspectingConfig()
  await updateProspectingConfig({ warmup: { ...config.warmup, ...parsed } })
  revalidatePath('/platform/prospecting/settings')
}

/**
 * Manual per-prospect enrichment refresh — recrawls their site (picking up
 * the new brand-capture signals on rows enriched before it existed),
 * refreshes Places data, and rescores. Budget-gated like the cron.
 */
export async function reEnrichProspectAction(
  prospectId: string,
): Promise<{ ok: boolean; reason?: string }> {
  await requirePlatformAdmin()
  const { reEnrichProspect } = await import('@/lib/services/prospect-enrich')
  const r = await reEnrichProspect(z.string().min(1).parse(prospectId))
  revalidatePath('/platform/prospecting')
  return r.ok ? { ok: true } : { ok: false, reason: r.reason }
}

/** Manually suppress a prospect (permanent; stops any live enrollment). */
export async function suppressProspectAction(prospectId: string, reason?: string): Promise<void> {
  await requirePlatformAdmin()
  await suppressProspect(z.string().min(1).parse(prospectId), reason?.slice(0, 200) || 'manual')
  revalidatePath('/platform/prospecting')
}

/** Enroll a prospect in the outreach sequence (fail-closed guards inside). */
export async function enrollProspectAction(
  prospectId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformAdmin()
  const { enrollProspect, ensureDefaultSequence } = await import(
    '@/lib/services/prospect-outreach'
  )
  await ensureDefaultSequence()
  const r = await enrollProspect(z.string().min(1).parse(prospectId))
  revalidatePath('/platform/prospecting')
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}

/** Stop a prospect's live enrollment (prospect stays contactable later). */
export async function stopEnrollmentAction(prospectId: string): Promise<void> {
  await requirePlatformAdmin()
  const { stopEnrollment } = await import('@/lib/services/prospect-outreach')
  await stopEnrollment(z.string().min(1).parse(prospectId))
  revalidatePath('/platform/prospecting')
}

const touchPatchSchema = z.object({
  templateId: z.string().min(1),
  subjectTemplate: z.string().min(3).max(200),
  bodyTemplate: z.string().min(10).max(4000),
  aiPersonalize: z.boolean(),
  dayOffset: z.number().int().min(0).max(60),
})

/** Edit one sequence touch (subject/body/AI toggle/day offset). */
export async function updateTouchTemplateAction(input: unknown): Promise<void> {
  await requirePlatformAdmin()
  const parsed = touchPatchSchema.parse(input)
  const { updateTouchTemplate } = await import('@/lib/services/prospect-outreach')
  await updateTouchTemplate(parsed.templateId, parsed)
  revalidatePath('/platform/prospecting/sequences')
}

/** Pause/resume a whole sequence (enrollments hold in place while paused). */
export async function setSequenceStatusAction(
  sequenceId: string,
  status: 'active' | 'paused',
): Promise<void> {
  await requirePlatformAdmin()
  const { setSequenceStatus } = await import('@/lib/services/prospect-outreach')
  await setSequenceStatus(
    z.string().min(1).parse(sequenceId),
    z.enum(['active', 'paused']).parse(status),
  )
  revalidatePath('/platform/prospecting/sequences')
}

const callOutcomeSchema = z.object({
  prospectId: z.string().min(1),
  outcome: z.enum(['no_answer', 'voicemail', 'callback', 'demo_booked', 'not_interested', 'won']),
  note: z.string().max(500).optional(),
})

/** Log a call outcome from the call list / drawer. */
export async function logCallOutcomeAction(input: unknown): Promise<void> {
  const ctx = await requirePlatformAdmin()
  const parsed = callOutcomeSchema.parse(input)
  const { logCallOutcome } = await import('@/lib/services/prospecting')
  await logCallOutcome({ ...parsed, calledByUserId: ctx.userId })
  revalidatePath('/platform/prospecting')
  revalidatePath('/platform/prospecting/call-list')
}

const convertSchema = z.object({
  prospectId: z.string().min(1),
  name: z.string().min(2).max(120),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(2).max(120),
  planId: z.enum(['basic', 'pro', 'premium']),
  interval: z.enum(['monthly', 'annual']),
  pricing: z.union([
    z.object({ kind: z.literal('standard') }),
    z.object({
      kind: z.literal('percent_off'),
      percentOff: z.number().int().min(1).max(100),
      durationMonths: z.number().int().min(1).max(60).optional(),
    }),
    z.object({ kind: z.literal('comped') }),
  ]),
})

/**
 * Prospect-branded live demo: drop the demo_skin cookie (cosmetic overlay —
 * the prospect's name/brand/city over the seeded Dream Dental org, ZERO DB
 * writes) and enter demo mode as owner. The skin only ever renders for a
 * platform admin inside demo mode (readDemoSkin guards), and exitDemoMode
 * clears it with the demo cookie.
 */
export async function startBrandedDemoAction(prospectId: string): Promise<void> {
  const ctx = await requirePlatformAdmin()
  const id = z.string().min(1).parse(prospectId)
  const [p] = await db
    .select({
      id: schema.prospect.id,
      name: schema.prospect.name,
      city: schema.prospect.city,
      websiteUrl: schema.prospect.websiteUrl,
      authorizedOfficialName: schema.prospect.authorizedOfficialName,
      googleRatingTenths: schema.prospect.googleRatingTenths,
      reviewCount: schema.prospect.reviewCount,
      enrichment: schema.prospect.enrichment,
      aiVerdict: schema.prospect.aiVerdict,
    })
    .from(schema.prospect)
    .where(eq(schema.prospect.id, id))
    .limit(1)
  if (!p) throw new Error('Prospect not found')

  const [demoOrg] = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.slug, DEMO_CLINIC_SLUG))
    .limit(1)

  // Self-heal + notification seed exactly like the Clinics "View as" path.
  const { createDemoClinic, seedDemoNotificationsForUser } = await import(
    '@/lib/services/demo-clinic'
  )
  const demo = await createDemoClinic()
  const orgId = demoOrg?.id ?? demo.organizationId
  await seedDemoNotificationsForUser(ctx.userId, orgId)

  // Full brand composition: their theme-color, their favicon logo, their
  // verified gaps as beat ammunition, the doctor's first name — all pure,
  // all size-capped for the cookie.
  const skin: DemoSkin = buildDemoSkin({
    prospect: {
      id: p.id,
      name: p.name,
      city: p.city,
      websiteUrl: p.websiteUrl,
      authorizedOfficialName: p.authorizedOfficialName,
      googleRatingTenths: p.googleRatingTenths,
      reviewCount: p.reviewCount,
    },
    signals: (p.enrichment ?? null) as import('@/lib/types/prospecting').ProspectCrawlSignals | null,
    verdict: (p.aiVerdict ?? null) as import('@/lib/types/prospecting').ProspectAiVerdict | null,
  })
  const cookieStore = await cookies()
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24, // one day — a demo, not a residency
  }
  cookieStore.set(DEMO_SKIN_COOKIE, JSON.stringify(skin), cookieOpts)
  cookieStore.set(
    'demo_context',
    JSON.stringify({ orgId, role: 'owner' }),
    { ...cookieOpts, maxAge: 60 * 60 * 24 * 7 },
  )
  redirect('/')
}

/**
 * Won prospect → real clinic org via the managed-provisioning rails
 * (reserved plan + coupon + owner invite), then linked back to the prospect.
 */
export async function convertProspectAction(
  input: unknown,
): Promise<{ ok: boolean; slug?: string; error?: string }> {
  const ctx = await requirePlatformAdmin()
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Forbidden: platform owner or admin only')
  }
  const parsed = convertSchema.parse(input)
  try {
    const { createManagedClinic } = await import('@/lib/services/clinic-provisioning')
    const { markConverted } = await import('@/lib/services/prospecting')
    const result = await createManagedClinic({
      name: parsed.name,
      ownerEmail: parsed.ownerEmail,
      ownerName: parsed.ownerName,
      planId: parsed.planId,
      interval: parsed.interval,
      pricing: parsed.pricing,
      note: `Converted from prospecting (${parsed.prospectId})`,
      inviterUserId: ctx.userId,
      inviterName: ctx.userName,
    })
    await markConverted(parsed.prospectId, result.organizationId)
    revalidatePath('/platform/prospecting')
    revalidatePath('/platform/prospecting/call-list')
    revalidatePath('/ecommerce/customers')
    return { ok: true, slug: result.slug }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Conversion failed.' }
  }
}
