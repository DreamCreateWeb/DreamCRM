'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireTenant } from '@/lib/auth/context'
import { assignClinicReferral, clearClinicReferral } from '@/lib/services/referrals'

/**
 * Referral assignment for ONE clinic — lives with the clinic-detail page whose
 * referral card is the only UI for it (moved from partners/admin-actions.ts in
 * the structure pass). Partner-wide actions stay in partners/.
 */
async function requirePlatformAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform') throw new Error('Forbidden: platform only')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Forbidden: platform owner or admin only')
  }
  return ctx
}

const AssignInput = z.object({
  organizationId: z.string().min(1),
  partnerId: z.string().min(1),
  percentBps: z.number().int().min(0).max(10000).nullable().optional(),
  termMonths: z.number().int().min(1).max(120).nullable().optional(),
})

export async function assignClinicReferralAction(input: unknown): Promise<{ ok: true }> {
  await requirePlatformAdmin()
  const data = AssignInput.parse(input)
  await assignClinicReferral(
    data.organizationId,
    data.partnerId,
    data.percentBps ?? undefined,
    data.termMonths !== undefined ? data.termMonths : undefined,
  )
  revalidatePath(`/ecommerce/customers/${data.organizationId}`)
  revalidatePath(`/partners/${data.partnerId}`)
  revalidatePath('/partners')
  return { ok: true }
}

export async function clearClinicReferralAction(
  organizationId: string,
  partnerId?: string,
): Promise<{ ok: true }> {
  await requirePlatformAdmin()
  await clearClinicReferral(z.string().min(1).parse(organizationId))
  revalidatePath(`/ecommerce/customers/${organizationId}`)
  if (partnerId) revalidatePath(`/partners/${partnerId}`)
  revalidatePath('/partners')
  return { ok: true }
}
