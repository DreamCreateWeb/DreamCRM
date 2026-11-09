'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { updateBalanceOutreachSettings } from '@/lib/services/balance-outreach'
import { markPaymentsPosted, unmarkPaymentPosted } from '@/lib/services/balance-payments'
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
    revalidatePath('/payments/online')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save' }
  }
}

type PostResult = { ok: true; changed: number } | { ok: false; error: string }

/** Mark online payments posted to the practice's ledger — stamped with who
 *  (the signed-in person) and when. Any clinic staff may post; never auto. */
export async function markPaymentsPostedAction(ids: string[]): Promise<PostResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can post payments' }
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: 'Pick at least one payment' }
  try {
    const changed = await markPaymentsPosted(ctx.organizationId, ids.slice(0, 200), ctx.userId)
    revalidatePath('/payments/online')
    revalidatePath('/payments')
    return { ok: true, changed }
  } catch {
    return { ok: false, error: 'Could not mark that posted — try again.' }
  }
}

/** Take the posted stamp back (a mis-click): the payment returns to "to post". */
export async function unmarkPaymentPostedAction(id: string): Promise<PostResult> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can post payments' }
  try {
    const done = await unmarkPaymentPosted(ctx.organizationId, id)
    revalidatePath('/payments/online')
    revalidatePath('/payments')
    return { ok: true, changed: done ? 1 : 0 }
  } catch {
    return { ok: false, error: 'Could not undo that — try again.' }
  }
}
