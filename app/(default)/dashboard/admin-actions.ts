'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { setGuardianAudience } from '@/lib/services/platform-config'
import type { GuardianAudience } from '@/lib/guardian'

/**
 * Platform-admin actions for the Guardian (Transformation Phase 4).
 *
 * The audience lock is Dream Create's own decision, made once, by a human —
 * so it lives here rather than anywhere a clinic can reach, and it gates to
 * platform owner/admin on the same bar as every other platform action. The
 * default is closed; this is the only way it opens.
 */
async function requirePlatformAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform') throw new Error('Forbidden: platform only')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Forbidden: platform owner or admin only')
  }
  return ctx
}

export async function setGuardianAudienceAction(input: {
  audience: GuardianAudience
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await requirePlatformAdmin()
  // Never trust the wire for a value that decides whether the machine
  // starts talking to customers: anything but the literal 'clinic' locks
  // back to platform-only, the same floor resolveGuardianAudience takes.
  const audience: GuardianAudience = input.audience === 'clinic' ? 'clinic' : 'platform'
  try {
    await setGuardianAudience(audience)
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Could not save that.' }
  }
  revalidatePath('/dashboard')
  return {
    ok: true,
    message:
      audience === 'clinic'
        ? 'Practices will now hear about the things they can fix themselves. Anything that is ours to fix still comes to you.'
        : 'Locked to you. Practices hear nothing from the Guardian.',
  }
}
