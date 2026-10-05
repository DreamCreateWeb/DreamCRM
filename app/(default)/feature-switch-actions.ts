'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { FEATURE_BY_KEY, FEATURE_INTRO, type FeatureKey } from '@/lib/feature-switches'
import { disableFeature, enableFeature } from '@/lib/services/feature-switches'

/**
 * The feature switches' two actions (docs/ACTIVATION.md law 2, S3). Shared
 * by every generic intro + footer rather than living next to one route,
 * because the switch is one thing: seven modules, one pair of verbs.
 * Owners and admins only — the insurance switch's `canManage` rule.
 */

export type FeatureSwitchResult = { ok: true } | { ok: false; error: string }

async function managerCtx() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return null
  if (ctx.role !== 'owner' && ctx.role !== 'admin') return null
  return ctx
}

function isKey(key: unknown): key is FeatureKey {
  return typeof key === 'string' && key in FEATURE_BY_KEY
}

export async function enableFeatureAction(key: FeatureKey): Promise<FeatureSwitchResult> {
  if (!isKey(key)) return { ok: false, error: 'Unknown feature.' }
  const ctx = await managerCtx()
  if (!ctx) return { ok: false, error: FEATURE_INTRO.onlyManagers }
  await enableFeature(ctx.organizationId, key)
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function disableFeatureAction(key: FeatureKey): Promise<FeatureSwitchResult> {
  if (!isKey(key)) return { ok: false, error: 'Unknown feature.' }
  const ctx = await managerCtx()
  if (!ctx) return { ok: false, error: FEATURE_INTRO.onlyManagers }
  await disableFeature(ctx.organizationId, key)
  revalidatePath('/', 'layout')
  return { ok: true }
}
