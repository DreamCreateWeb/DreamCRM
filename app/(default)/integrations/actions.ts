'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { planAllows } from '@/lib/modules'
import type { PlanTier } from '@/lib/modules'
import { connectOpenDental, disconnectPms, runImport, setAutoSync, setSyncDirection } from '@/lib/services/pms'
import type { SyncDirection } from '@/lib/types/pms'

function ensureClinicAdmin(ctx: { tenantType: string; role: string; planTier: PlanTier }) {
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Integrations is only available for clinic tenants.')
  }
  if (ctx.role === 'patient') {
    throw new Error('Patients cannot manage integrations.')
  }
  // Integrations is Premium-tier (lib/modules/clinic.ts) — block below-tier
  // clinics from firing the action even via deep-link. Demo contexts inherit
  // the demo org's tier (premium), so they pass.
  if (!planAllows(ctx.planTier, 'premium')) {
    throw new Error('Integrations is on the Premium plan. Upgrade to connect your PMS.')
  }
}

export interface ConnectResult {
  ok: boolean
  error?: string
  practiceTitle?: string
}

export async function connectOpenDentalAction(formData: FormData): Promise<ConnectResult> {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  const customerKey = formData.get('customerKey')?.toString() ?? ''
  try {
    const test = await connectOpenDental(ctx.organizationId, ctx.userId, customerKey)
    // Kick off the FIRST import immediately, best-effort + detached — so a freshly
    // connected office sees its patients/schedule land without having to find and
    // click "Sync now". We do NOT await it: a large first import (budgeted +
    // resumable inside runImport) can take a while, and the connect action should
    // return right away so the UI lands on the status card showing progress. The
    // hourly cron continues any budget-capped first pass. Errors here never fail
    // the connect (the connection is already saved; a manual sync can retry).
    void runImport(ctx.organizationId, { trigger: 'initial', triggeredByUserId: ctx.userId }).catch((err) => {
      console.warn('[integrations] initial import kickoff failed', err)
    })
    revalidatePath('/integrations')
    return { ok: true, practiceTitle: test.practiceTitle }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export interface SyncResultView {
  ok: boolean
  status?: string
  error?: string
  /** True when the run hit its time budget and parked a resume cursor — the
   *  next run (manual or the hourly cron) continues automatically. */
  partial?: boolean
  /** Patient-import progress for the in-flight first import. */
  progress?: { imported: number; total: number }
}

export async function syncNowAction(): Promise<SyncResultView> {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  try {
    const result = await runImport(ctx.organizationId, { trigger: 'manual', triggeredByUserId: ctx.userId })
    revalidatePath('/integrations')
    return {
      ok: result.status !== 'error',
      status: result.status,
      error: result.error ?? undefined,
      partial: result.resumeAvailable,
      progress: result.progress ?? undefined,
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function disconnectPmsAction() {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await disconnectPms(ctx.organizationId)
  revalidatePath('/integrations')
}

export async function setSyncDirectionAction(direction: SyncDirection) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await setSyncDirection(ctx.organizationId, direction)
  revalidatePath('/integrations')
}

export async function setAutoSyncAction(enabled: boolean) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await setAutoSync(ctx.organizationId, enabled)
  revalidatePath('/integrations')
}

// ── Zernio (Google Business) ────────────────────────────────────────────────

/**
 * Google Business gate — clinic tenant + owner/admin, on ANY plan. GBP is free
 * + separate from the Premium PMS integration on every tier (Basic included;
 * see lib/types/social-entitlements.ts), so it deliberately does NOT use the
 * Premium-gated `ensureClinicAdmin` above.
 */
function ensureClinicGbpAdmin(ctx: { tenantType: string; role: string }) {
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Google Business is only available for clinic tenants.')
  }
  if (ctx.role === 'patient' || ctx.role === 'member') {
    throw new Error('Only an owner or admin can manage Google Business.')
  }
}

export interface ZernioSyncResult {
  ok: boolean
  error?: string
}

/**
 * Re-pull the org's connected Zernio accounts and persist them. The Google
 * Business card calls this on window focus + via a "Refresh" button, so a
 * connection completed at Zernio's dashboard (the default return target) is
 * detected when the clinic comes back to /integrations. Demo-safe (the service
 * short-circuits on a demo connection). Best-effort — surfaces any error.
 */
export async function syncZernioAccountsAction(): Promise<ZernioSyncResult> {
  try {
    const ctx = await requireTenant()
    ensureClinicGbpAdmin(ctx)
    const { syncConnectedAccounts } = await import('@/lib/services/zernio')
    await syncConnectedAccounts(ctx.organizationId)
    revalidatePath('/integrations')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Disconnect Google Business for this clinic (best-effort at Zernio, always
 *  drops our rows). */
export async function disconnectZernioGoogleAction(): Promise<ZernioSyncResult> {
  try {
    const ctx = await requireTenant()
    ensureClinicGbpAdmin(ctx)
    const { disconnectPlatform } = await import('@/lib/services/zernio')
    await disconnectPlatform(ctx.organizationId, 'googlebusiness')
    revalidatePath('/integrations')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
