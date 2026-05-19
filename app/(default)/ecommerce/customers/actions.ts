'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  CustomerInput,
  CustomerUpdate,
  createCustomer,
  deleteCustomers,
  toggleFav,
  updateCustomer,
} from '@/lib/services/customers'

export async function addCustomer(input: unknown) {
  const ctx = await requireTenant()
  const data = CustomerInput.parse(input)
  const customer = await createCustomer(data, ctx.userId, ctx.organizationId)
  revalidatePath('/ecommerce/customers')
  return customer
}

export async function editCustomer(id: number, input: unknown) {
  const ctx = await requireTenant()
  const data = CustomerUpdate.parse(input)
  const customer = await updateCustomer(id, ctx.organizationId, data)
  revalidatePath('/ecommerce/customers')
  return customer
}

export async function toggleCustomerFav(id: number) {
  const ctx = await requireTenant()
  const result = await toggleFav(id, ctx.organizationId)
  revalidatePath('/ecommerce/customers')
  return result
}

export async function removeCustomers(ids: number[]) {
  const ctx = await requireTenant()
  const result = await deleteCustomers(ids.filter((n) => Number.isInteger(n)), ctx.organizationId)
  revalidatePath('/ecommerce/customers')
  return result
}
