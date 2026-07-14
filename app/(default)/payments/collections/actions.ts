'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { proposePaymentPlan, cancelPaymentPlan } from '@/lib/services/payment-plans'

/** Money actions are owner/admin — a member works the board, but committing a
 *  patient to an autopay schedule (or killing one) is a manager call. */
async function requireManager() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Clinic staff only.')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Only owners and admins can manage payment plans.')
  }
  return ctx
}

export async function proposePlanAction(input: {
  patientId: string
  totalCents: number
  installments: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const ctx = await requireManager()
    const r = await proposePaymentPlan(
      ctx.organizationId,
      input.patientId,
      { totalCents: input.totalCents, installments: input.installments },
      ctx.userId,
    )
    if (!r.ok) return r
    revalidatePath('/payments/collections')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
}

export async function cancelPlanAction(
  planId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const ctx = await requireManager()
    const r = await cancelPaymentPlan(ctx.organizationId, planId)
    if (!r.ok) return r
    revalidatePath('/payments/collections')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong.' }
  }
}
