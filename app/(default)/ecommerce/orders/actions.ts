'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { OrderInput, createOrder, deleteOrders, updateOrderStatus } from '@/lib/services/orders'

export async function addOrder(input: unknown) {
  await requireUser()
  const order = await createOrder(OrderInput.parse(input))
  revalidatePath('/ecommerce/orders')
  return order
}

export async function setOrderStatus(id: number, status: string) {
  await requireUser()
  const order = await updateOrderStatus(id, status as any)
  revalidatePath('/ecommerce/orders')
  return order
}

export async function removeOrders(ids: number[]) {
  await requireUser()
  const result = await deleteOrders(ids.filter(Number.isInteger))
  revalidatePath('/ecommerce/orders')
  return result
}
