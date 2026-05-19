'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { checkoutCart } from '@/lib/services/cart'
import { createOrder, updateOrderStatus } from '@/lib/services/orders'

export async function payForCart() {
  const ctx = await requireTenant()
  const order = await checkoutCart(ctx.userId, ctx.organizationId)
  revalidatePath('/ecommerce/cart')
  revalidatePath('/ecommerce/orders')
  return { orderNumber: order.orderNumber, id: order.id }
}

export async function payForAmount(amountCents: number) {
  const ctx = await requireTenant()
  const order = await createOrder(
    {
      totalCents: amountCents,
      status: 'processing',
      currency: 'USD',
      items: [],
    },
    ctx.organizationId,
  )
  revalidatePath('/ecommerce/orders')
  return { orderNumber: order.orderNumber, id: order.id }
}

export async function markOrderPaid(orderId: number) {
  const ctx = await requireTenant()
  const row = await updateOrderStatus(orderId, ctx.organizationId, 'delivered')
  revalidatePath('/ecommerce/orders')
  return row
}
