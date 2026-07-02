'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { planAllows } from '@/lib/modules'
import {
  saveProduct,
  setProductStatus,
  deleteProduct,
  updateShopConfig,
  setOrderFulfillment,
  type ShopConfigPatch,
} from '@/lib/services/shop'
import { disconnectShopStripe } from '@/lib/services/shop-connect'
import type { ProductInput, ProductStatus, FulfillmentStatus } from '@/lib/types/shop'

async function ensureClinicAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Shop is only available for clinic tenants.')
  if (ctx.role === 'patient') throw new Error('Patients cannot manage the shop.')
  // Shop is Premium-tier (lib/modules/clinic.ts) — block below-tier clinics
  // from firing the action even if they reach it by deep-link. Platform-admin
  // demo contexts inherit the demo org's tier (premium), so they pass.
  if (!planAllows(ctx.planTier, 'premium')) {
    throw new Error('Shop is on the Premium plan. Upgrade to manage your storefront.')
  }
  return ctx
}

export async function saveProductAction(input: ProductInput): Promise<{ id: string }> {
  const ctx = await ensureClinicAdmin()
  if (!input.name?.trim()) throw new Error('Product name is required')
  if (input.variants.every((v) => !v.name.trim())) throw new Error('Add at least one variant')
  const id = await saveProduct(ctx.organizationId, input)
  revalidatePath('/shop')
  return { id }
}

export async function setProductStatusAction(id: string, status: ProductStatus) {
  const ctx = await ensureClinicAdmin()
  await setProductStatus(ctx.organizationId, id, status)
  revalidatePath('/shop')
}

export async function deleteProductAction(id: string) {
  const ctx = await ensureClinicAdmin()
  await deleteProduct(ctx.organizationId, id)
  revalidatePath('/shop')
}

export async function updateShopConfigAction(patch: ShopConfigPatch) {
  const ctx = await ensureClinicAdmin()
  await updateShopConfig(ctx.organizationId, patch)
  revalidatePath('/shop')
}

export async function disconnectStripeAction() {
  const ctx = await ensureClinicAdmin()
  await disconnectShopStripe(ctx.organizationId)
  revalidatePath('/shop')
}

export async function setOrderFulfillmentAction(id: string, status: FulfillmentStatus, trackingNumber?: string | null) {
  const ctx = await ensureClinicAdmin()
  await setOrderFulfillment(ctx.organizationId, id, status, trackingNumber)
  revalidatePath('/shop/orders')
}

/** Loyalty program config — the points card at the bottom of the Shop hub.
 *  Owner/admin via the same clinic+plan gate as every shop mutation. */
export async function saveLoyaltySettingsAction(input: {
  enabled: boolean
  pointsPerVisit: number
  pointsPerReferral: number
  pointsPerPayment: number
  redeemPoints: number
  redeemValueCents: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const ctx = await ensureClinicAdmin()
    const { updateLoyaltySettings } = await import('@/lib/services/loyalty')
    await updateLoyaltySettings(ctx.organizationId, input)
    revalidatePath('/shop')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save.' }
  }
}
