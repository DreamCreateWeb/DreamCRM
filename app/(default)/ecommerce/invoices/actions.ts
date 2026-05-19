'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  InvoiceInput,
  createInvoice,
  deleteInvoices,
  setInvoiceStatus,
} from '@/lib/services/invoices'

export async function addInvoice(input: unknown) {
  const ctx = await requireTenant()
  const invoice = await createInvoice(InvoiceInput.parse(input), ctx.organizationId)
  revalidatePath('/ecommerce/invoices')
  return invoice
}

export async function changeInvoiceStatus(id: number, status: string) {
  const ctx = await requireTenant()
  const invoice = await setInvoiceStatus(id, ctx.organizationId, status as any)
  revalidatePath('/ecommerce/invoices')
  return invoice
}

export async function removeInvoices(ids: number[]) {
  const ctx = await requireTenant()
  const result = await deleteInvoices(ids.filter(Number.isInteger), ctx.organizationId)
  revalidatePath('/ecommerce/invoices')
  return result
}
