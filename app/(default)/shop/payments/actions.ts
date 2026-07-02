'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { updateBalanceOutreachSettings } from '@/lib/services/balance-outreach'
import type { BalanceOutreachSettings } from '@/lib/types/balance-outreach'

/** Save the automatic balance-reminder cadence (owner/admin, clinic only).
 *  The service resolver re-sanitizes, so junk can't poison the column. */
export async function saveBalanceOutreachAction(
  settings: BalanceOutreachSettings,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can edit this' }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return { ok: false, error: 'Only owners and admins can change balance reminders' }
  }
  try {
    await updateBalanceOutreachSettings(ctx.organizationId, settings)
    revalidatePath('/shop/payments')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save' }
  }
}
