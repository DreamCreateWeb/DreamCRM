'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { checkoutCart } from '@/lib/services/cart'
import { createOrder, updateOrderStatus } from '@/lib/services/orders'

export async function payForCart() {
  const user = await requireUser()
  const order = await checkoutCart(user.id)
  revalidatePath('/ecommerce/cart')
  revalidatePath('/ecommerce/orders')
  return { orderNumber: order.orderNumber, id: order.id }
}

export async function payForAmount(amountCents: number) {
  await requireUser()
  const order = await createOrder({
    totalCents: amountCents,
    status: 'processing',
    currency: 'USD',
    items: [],
  })
  revalidatePath('/ecommerce/orders')
  return { orderNumber: order.orderNumber, id: order.id }
}

export async function markOrderPaid(orderId: number) {
  await requireUser()
  const row = await updateOrderStatus(orderId, 'delivered')
  revalidatePath('/ecommerce/orders')
  return row
}
