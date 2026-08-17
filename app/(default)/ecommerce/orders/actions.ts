'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { OrderInput, createOrder, deleteOrders, updateOrderStatus } from '@/lib/services/orders'

// Orders are clinic/platform staff business data. A patient-role member carries
// the clinic organizationId and would pass a bare requireTenant(), so these
// directly-invocable server actions must reject the patient persona explicitly
// (page-level redirects don't guard server actions).
async function requireStaff() {
  const ctx = await requireTenant()
  // Positively require a staff persona (clinic or platform) rather than
  // excluding patients by subtraction — subtraction also admits the partner
  // persona (tenantType 'partner', role 'member').
  if (ctx.tenantType !== 'clinic' && ctx.tenantType !== 'platform') {
    throw new Error('Orders are only available to staff.')
  }
  return ctx
}

export async function addOrder(input: unknown) {
  const ctx = await requireStaff()
  const order = await createOrder(OrderInput.parse(input), ctx.organizationId)
  revalidatePath('/ecommerce/orders')
  return order
}

export async function setOrderStatus(id: number, status: string) {
  const ctx = await requireStaff()
  const order = await updateOrderStatus(id, ctx.organizationId, status as any)
  revalidatePath('/ecommerce/orders')
  return order
}

export async function removeOrders(ids: number[]) {
  const ctx = await requireStaff()
  const result = await deleteOrders(ids.filter(Number.isInteger), ctx.organizationId)
  revalidatePath('/ecommerce/orders')
  return result
}
