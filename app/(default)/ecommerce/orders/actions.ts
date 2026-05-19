'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { OrderInput, createOrder, deleteOrders, updateOrderStatus } from '@/lib/services/orders'

export async function addOrder(input: unknown) {
  const ctx = await requireTenant()
  const order = await createOrder(OrderInput.parse(input), ctx.organizationId)
  revalidatePath('/ecommerce/orders')
  return order
}

export async function setOrderStatus(id: number, status: string) {
  const ctx = await requireTenant()
  const order = await updateOrderStatus(id, ctx.organizationId, status as any)
  revalidatePath('/ecommerce/orders')
  return order
}

export async function removeOrders(ids: number[]) {
  const ctx = await requireTenant()
  const result = await deleteOrders(ids.filter(Number.isInteger), ctx.organizationId)
  revalidatePath('/ecommerce/orders')
  return result
}
