'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
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
