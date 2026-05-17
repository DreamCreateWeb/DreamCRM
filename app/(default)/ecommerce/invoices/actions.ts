'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import {
  InvoiceInput,
  createInvoice,
  deleteInvoices,
  setInvoiceStatus,
} from '@/lib/services/invoices'

export async function addInvoice(input: unknown) {
  await requireUser()
  const invoice = await createInvoice(InvoiceInput.parse(input))
  revalidatePath('/ecommerce/invoices')
  return invoice
}

export async function changeInvoiceStatus(id: number, status: string) {
  await requireUser()
  const invoice = await setInvoiceStatus(id, status as any)
  revalidatePath('/ecommerce/invoices')
  return invoice
}

export async function removeInvoices(ids: number[]) {
  await requireUser()
  const result = await deleteInvoices(ids.filter(Number.isInteger))
  revalidatePath('/ecommerce/invoices')
  return result
}
