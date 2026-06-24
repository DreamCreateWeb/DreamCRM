'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { planAllows } from '@/lib/modules'
import type { PlanTier } from '@/lib/modules'
import { connectOpenDental, disconnectPms, runImport, setAutoSync, setSyncDirection } from '@/lib/services/pms'
import type { SyncDirection } from '@/lib/types/pms'
import { isConnectablePlatform, type ZernioPlatform } from '@/lib/types/zernio'

function ensureClinicAdmin(ctx: { tenantType: string; role: string; planTier: PlanTier }) {
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Integrations is only available for clinic tenants.')
  }
  // Connecting / disconnecting / reconfiguring the PMS triggers a PHI import
  // and is a privileged settings mutation — owner/admin only, matching every
  // other settings surface (and the sibling ensureClinicChannelsAdmin). A
  // front-desk `member` must not be able to sever or re-point the integration.
  if (ctx.role === 'patient' || ctx.role === 'member') {
    throw new Error('Only an owner or admin can manage integrations.')
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

// ── Zernio (Google Business + social channels) ───────────────────────────────
//
// The /channels surface was consolidated INTO /integrations (the app-library
// redesign), so the per-platform connect/disconnect/refresh actions live here
// now. GBP + social connect/disconnect is clinic + owner/admin on ANY plan
// (GBP is free + separate; the per-platform social CAP is enforced in the
// connect ROUTE before OAuth, not here — disconnecting is always allowed).
// These reuse the SAME generalized service primitives (`syncConnectedAccounts`
// / `disconnectPlatform`) — no duplicate plumbing.

/**
 * Channels gate — clinic tenant + owner/admin, on ANY plan. GBP + the social
 * shortlist are free/cap-bounded + separate from the Premium PMS integration on
 * every tier (Basic included; see lib/types/social-entitlements.ts), so it
 * deliberately does NOT use the Premium-gated `ensureClinicAdmin` above.
 */
function ensureClinicChannelsAdmin(ctx: { tenantType: string; role: string }) {
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Integrations are only available for clinic tenants.')
  }
  if (ctx.role === 'patient' || ctx.role === 'member') {
    throw new Error('Only an owner or admin can manage channels.')
  }
}

export interface ZernioSyncResult {
  ok: boolean
  error?: string
}

/**
 * Re-pull the org's connected Zernio accounts (ALL platforms) and persist them.
 * The Google Business + social channel cards call this on window focus after a
 * connect attempt + via a "Refresh" button, so a connection completed at
 * Zernio's dashboard (the default return target) is detected when the clinic
 * comes back to /integrations. Demo-safe (the service short-circuits on a demo
 * connection). Best-effort — surfaces any error.
 */
export async function syncZernioAccountsAction(): Promise<ZernioSyncResult> {
  try {
    const ctx = await requireTenant()
    ensureClinicChannelsAdmin(ctx)
    const { syncConnectedAccounts } = await import('@/lib/services/zernio')
    await syncConnectedAccounts(ctx.organizationId)
    revalidatePath('/integrations')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Alias kept for the GBP card / Channels-style callers — the same all-platform
 *  re-sync. */
export const refreshChannelsAction = syncZernioAccountsAction

/**
 * DEMO-ONLY: "connect" a channel in the demo by seeding its synthetic connected
 * account — no real OAuth, no network. A platform admin exploring the demo can't
 * authorize a real Google/social account into the synthetic demo clinic, so the
 * connect buttons simulate the result instead of bouncing off a dead OAuth.
 * Refuses outside demo mode and never touches a real connection.
 */
export async function simulateDemoConnectAction(platform: string): Promise<ZernioSyncResult> {
  try {
    const ctx = await requireTenant()
    ensureClinicChannelsAdmin(ctx)
    if (!ctx.isDemo) return { ok: false, error: 'This is only available while viewing the demo.' }
    if (!isConnectablePlatform(platform)) return { ok: false, error: 'That platform can’t be connected.' }
    const { simulateDemoConnect } = await import('@/lib/services/zernio')
    await simulateDemoConnect(ctx.organizationId, platform as ZernioPlatform)
    revalidatePath('/integrations')
    revalidatePath('/social-posts')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Disconnect Google Business for this clinic (best-effort at Zernio, always
 *  drops our rows). Thin wrapper over the generic per-platform disconnect. */
export async function disconnectZernioGoogleAction(): Promise<ZernioSyncResult> {
  return disconnectChannelAction('googlebusiness')
}

/**
 * Disconnect a single connectable platform (GBP or a shortlisted social
 * platform) for this clinic — best-effort at Zernio, always drops our rows.
 * Rejects an off-list platform defensively. Disconnect is never cap-gated.
 */
export async function disconnectChannelAction(platform: string): Promise<ZernioSyncResult> {
  try {
    const ctx = await requireTenant()
    ensureClinicChannelsAdmin(ctx)
    if (!isConnectablePlatform(platform)) {
      return { ok: false, error: 'That channel can’t be managed here.' }
    }
    const { disconnectPlatform } = await import('@/lib/services/zernio')
    await disconnectPlatform(ctx.organizationId, platform as ZernioPlatform)
    revalidatePath('/integrations')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── Social-connection add-on (consolidated from Settings → Billing) ──────────
//
// The app-library redesign makes /integrations the canonical place to manage
// the social-connection add-on (alongside the channels it raises the cap for).
// These mirror the Settings → Billing actions (which stay live for the slim
// summary card there) — owner/admin + clinic, `{ ok | error }` so the UI can
// surface the underlying guard message (Basic → "Upgrade to Pro", comped →
// "managed billing", env-unset → "coming soon").

export interface AddonActionResult {
  ok: boolean
  error?: string
}

/** Buy the social-connection add-on (a Stripe subscription item) for this clinic. */
export async function buySocialAddonAction(): Promise<AddonActionResult> {
  try {
    const ctx = await requireTenant()
    ensureClinicChannelsAdmin(ctx)
    const { addSocialAddon } = await import('@/lib/services/social-billing')
    await addSocialAddon(ctx.organizationId)
    revalidatePath('/integrations')
    revalidatePath('/settings/billing')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Cancel the social-connection add-on subscription item. Owner/admin + clinic. */
export async function cancelSocialAddonAction(): Promise<AddonActionResult> {
  try {
    const ctx = await requireTenant()
    ensureClinicChannelsAdmin(ctx)
    const { removeSocialAddon } = await import('@/lib/services/social-billing')
    await removeSocialAddon(ctx.organizationId)
    revalidatePath('/integrations')
    revalidatePath('/settings/billing')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
