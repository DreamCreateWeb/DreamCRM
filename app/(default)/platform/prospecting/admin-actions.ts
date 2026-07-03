'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireTenant } from '@/lib/auth/context'
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
