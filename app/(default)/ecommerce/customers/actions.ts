'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import {
  CustomerInput,
  CustomerUpdate,
  createCustomer,
  deleteCustomers,
  toggleFav,
  updateCustomer,
} from '@/lib/services/customers'

export async function addCustomer(input: unknown) {
  const user = await requireUser()
  const data = CustomerInput.parse(input)
  const customer = await createCustomer(data, user.id)
  revalidatePath('/ecommerce/customers')
  return customer
}

export async function editCustomer(id: number, input: unknown) {
  await requireUser()
  const data = CustomerUpdate.parse(input)
  const customer = await updateCustomer(id, data)
  revalidatePath('/ecommerce/customers')
  return customer
}

export async function toggleCustomerFav(id: number) {
  await requireUser()
  const result = await toggleFav(id)
  revalidatePath('/ecommerce/customers')
  return result
}

export async function removeCustomers(ids: number[]) {
  await requireUser()
  const result = await deleteCustomers(ids.filter((n) => Number.isInteger(n)))
  revalidatePath('/ecommerce/customers')
  return result
}
