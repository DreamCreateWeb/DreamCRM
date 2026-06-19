'use server'

import { requireTenant } from '@/lib/auth/context'
import { setDigestOptOut } from '@/lib/services/staff-notification-pref'

/** Mute / un-mute the current staff member's own morning digest email. */
export async function setMyDigestOptOutAction(
  optedOut: boolean,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { error: 'Only clinic staff can change this.' }
  try {
    await setDigestOptOut(ctx.organizationId, ctx.userId, optedOut)
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save your preference.' }
  }
}
