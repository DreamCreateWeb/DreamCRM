'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  addToCart as addToCartSvc,
  removeFromCart as removeFromCartSvc,
  updateCartQuantity as updateCartQuantitySvc,
  checkoutCart as checkoutCartSvc,
} from '@/lib/services/cart'

export async function addToCart(productId: number, quantity: number = 1) {
  const ctx = await requireTenant()
  const row = await addToCartSvc(ctx.userId, ctx.organizationId, productId, quantity)
  revalidatePath('/ecommerce/cart')
  revalidatePath('/ecommerce/cart-2')
  revalidatePath('/ecommerce/cart-3')
  return row
}

export async function removeFromCart(productId: number) {
  const ctx = await requireTenant()
  await removeFromCartSvc(ctx.userId, ctx.organizationId, productId)
  revalidatePath('/ecommerce/cart')
  revalidatePath('/ecommerce/cart-2')
  revalidatePath('/ecommerce/cart-3')
}

export async function updateCartQuantity(productId: number, quantity: number) {
  const ctx = await requireTenant()
  await updateCartQuantitySvc(ctx.userId, ctx.organizationId, productId, quantity)
  revalidatePath('/ecommerce/cart')
}

export async function checkoutCart() {
  const ctx = await requireTenant()
  const order = await checkoutCartSvc(ctx.userId, ctx.organizationId)
  revalidatePath('/ecommerce/cart')
  revalidatePath('/ecommerce/orders')
  return order
}
