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

// The customers table is the shared CRM/leads store — staff business data. A
// patient-role member carries the clinic organizationId and would pass a bare
// requireTenant(), so these directly-invocable server actions must positively
// require a staff persona (clinic or platform); page redirects don't guard
// server actions, and excluding patients by subtraction would still admit the
// partner persona.
async function requireStaff() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic' && ctx.tenantType !== 'platform') {
    throw new Error('Customers are only available to staff.')
  }
  return ctx
}

export async function addCustomer(input: unknown) {
  const ctx = await requireStaff()
  const data = CustomerInput.parse(input)
  const customer = await createCustomer(data, ctx.userId, ctx.organizationId)
  revalidatePath('/ecommerce/customers')
  return customer
}

export async function editCustomer(id: number, input: unknown) {
  const ctx = await requireStaff()
  const data = CustomerUpdate.parse(input)
  const customer = await updateCustomer(id, ctx.organizationId, data)
  revalidatePath('/ecommerce/customers')
  return customer
}

export async function toggleCustomerFav(id: number) {
  const ctx = await requireStaff()
  const result = await toggleFav(id, ctx.organizationId)
  revalidatePath('/ecommerce/customers')
  return result
}

export async function removeCustomers(ids: number[]) {
  const ctx = await requireStaff()
  const result = await deleteCustomers(ids.filter((n) => Number.isInteger(n)), ctx.organizationId)
  revalidatePath('/ecommerce/customers')
  return result
}
