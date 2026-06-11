'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { planAllows } from '@/lib/modules'
import { createCoupon, deactivateCoupon, generateBirthdayCoupons } from '@/lib/services/coupons'
import type { DiscountType } from '@/lib/types/shop'

async function ensureClinicAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Coupons are only available for clinic tenants.')
  if (ctx.role === 'patient') throw new Error('Patients cannot manage coupons.')
  // Coupons live inside the Premium-tier Shop module (lib/modules/clinic.ts)
  // — block below-tier clinics from the action even via deep-link. Demo
  // contexts inherit the demo org's premium tier, so they pass.
  if (!planAllows(ctx.planTier, 'premium')) {
    throw new Error('Shop is on the Premium plan. Upgrade to manage coupons.')
  }
  return ctx
}

export async function createCouponAction(input: {
  code: string
  discountType: DiscountType
  value: number
  minSubtotalDollars?: number | null
  expiresAt?: string | null
  singleUse: boolean
}): Promise<void> {
  const ctx = await ensureClinicAdmin()
  if (!input.code?.trim()) throw new Error('Enter a code')
  if (!(Number(input.value) > 0)) throw new Error('Enter a discount above 0')
  const discountValue = input.discountType === 'amount' ? Math.round(Number(input.value) * 100) : Math.round(Number(input.value))
  if (input.discountType === 'percent' && discountValue > 100) throw new Error('Percent cannot exceed 100')
  await createCoupon(ctx.organizationId, {
    code: input.code,
    discountType: input.discountType,
    discountValue,
    minSubtotalCents: input.minSubtotalDollars ? Math.round(input.minSubtotalDollars * 100) : null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    singleUse: input.singleUse,
    source: 'manual',
  })
  revalidatePath('/shop/coupons')
}

export async function deactivateCouponAction(id: string): Promise<void> {
  const ctx = await ensureClinicAdmin()
  await deactivateCoupon(ctx.organizationId, id)
  revalidatePath('/shop/coupons')
}

export async function generateBirthdayCouponsAction(): Promise<{ created: number }> {
  const ctx = await ensureClinicAdmin()
  const created = await generateBirthdayCoupons(ctx.organizationId, { discountType: 'percent', discountValue: 15 })
  revalidatePath('/shop/coupons')
  return { created }
}
