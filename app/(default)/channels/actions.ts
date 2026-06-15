'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { isConnectablePlatform, type ZernioPlatform } from '@/lib/types/zernio'

/**
 * Channels surface server actions — refresh (re-sync) + disconnect per platform.
 * Gated clinic tenant + owner/admin on ANY plan (GBP is free on every tier; the
 * per-platform social CAP is enforced in the connect ROUTE before OAuth, not
 * here — disconnecting is always allowed). `{ ok | error }` shape.
 *
 * These reuse the SAME generalized service primitives the GBP card uses
 * (`syncConnectedAccounts` / `disconnectPlatform`) — no duplicate plumbing.
 */

function ensureClinicChannelsAdmin(ctx: { tenantType: string; role: string }) {
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Channels are only available for clinic tenants.')
  }
  if (ctx.role === 'patient' || ctx.role === 'member') {
    throw new Error('Only an owner or admin can manage channels.')
  }
}

export interface ChannelActionResult {
  ok: boolean
  error?: string
}

/**
 * Re-pull the org's connected Zernio accounts (all platforms) and persist them.
 * The Channels surface calls this on window focus after a connect attempt + via
 * the Refresh button, so a connection completed at Zernio's dashboard (the
 * default return target) is detected when the clinic tabs back. Demo-safe (the
 * service short-circuits on a demo connection). Best-effort — surfaces any error.
 */
export async function refreshChannelsAction(): Promise<ChannelActionResult> {
  try {
    const ctx = await requireTenant()
    ensureClinicChannelsAdmin(ctx)
    const { syncConnectedAccounts } = await import('@/lib/services/zernio')
    await syncConnectedAccounts(ctx.organizationId)
    revalidatePath('/channels')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Disconnect a single platform (GBP or a shortlisted social platform) for this
 * clinic (best-effort at Zernio, always drops our rows). Rejects an off-list
 * platform defensively. Disconnect is never cap-gated.
 */
export async function disconnectChannelAction(platform: string): Promise<ChannelActionResult> {
  try {
    const ctx = await requireTenant()
    ensureClinicChannelsAdmin(ctx)
    if (!isConnectablePlatform(platform)) {
      return { ok: false, error: 'That channel can’t be managed here.' }
    }
    const { disconnectPlatform } = await import('@/lib/services/zernio')
    await disconnectPlatform(ctx.organizationId, platform as ZernioPlatform)
    revalidatePath('/channels')
    // The GBP card lives on /integrations too — keep it in sync on a GBP change.
    revalidatePath('/integrations')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
