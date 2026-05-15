'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import {
  addToCart as addToCartSvc,
  removeFromCart as removeFromCartSvc,
  updateCartQuantity as updateCartQuantitySvc,
  checkoutCart as checkoutCartSvc,
} from '@/lib/services/cart'

export async function addToCart(productId: number, quantity: number = 1) {
  const user = await requireUser()
  const row = await addToCartSvc(user.id, productId, quantity)
  revalidatePath('/ecommerce/cart')
  revalidatePath('/ecommerce/cart-2')
  revalidatePath('/ecommerce/cart-3')
  return row
}

export async function removeFromCart(productId: number) {
  const user = await requireUser()
  await removeFromCartSvc(user.id, productId)
  revalidatePath('/ecommerce/cart')
  revalidatePath('/ecommerce/cart-2')
  revalidatePath('/ecommerce/cart-3')
}

export async function updateCartQuantity(productId: number, quantity: number) {
  const user = await requireUser()
  await updateCartQuantitySvc(user.id, productId, quantity)
  revalidatePath('/ecommerce/cart')
}

export async function checkoutCart() {
  const user = await requireUser()
  const order = await checkoutCartSvc(user.id)
  revalidatePath('/ecommerce/cart')
  revalidatePath('/ecommerce/orders')
  return order
}
