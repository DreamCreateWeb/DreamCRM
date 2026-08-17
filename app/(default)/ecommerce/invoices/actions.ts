'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  InvoiceInput,
  createInvoice,
  deleteInvoices,
  setInvoiceStatus,
} from '@/lib/services/invoices'

// Invoices are staff business/money data. A patient-role member carries the
// clinic organizationId and would pass a bare requireTenant(), so these
// directly-invocable server actions must positively require a staff persona.
async function requireStaff() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic' && ctx.tenantType !== 'platform') {
    throw new Error('Invoices are only available to staff.')
  }
  return ctx
}

export async function addInvoice(input: unknown) {
  const ctx = await requireStaff()
  const invoice = await createInvoice(InvoiceInput.parse(input), ctx.organizationId)
  revalidatePath('/ecommerce/invoices')
  return invoice
}

export async function changeInvoiceStatus(id: number, status: string) {
  const ctx = await requireStaff()
  const invoice = await setInvoiceStatus(id, ctx.organizationId, status as any)
  revalidatePath('/ecommerce/invoices')
  return invoice
}

export async function removeInvoices(ids: number[]) {
  const ctx = await requireStaff()
  const result = await deleteInvoices(ids.filter(Number.isInteger), ctx.organizationId)
  revalidatePath('/ecommerce/invoices')
  return result
}
