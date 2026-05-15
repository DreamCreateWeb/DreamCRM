import 'server-only'
import { and, count, desc, eq, ilike, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'

export const InvoiceInput = z.object({
  customerId: z.number().int().nullable().optional(),
  status: z.enum(['draft', 'pending', 'paid', 'overdue', 'cancelled']).default('draft'),
  totalCents: z.number().int().min(0),
  currency: z.string().length(3).default('USD'),
  dueDate: z.string().nullable().optional(),
  notes: z.string().max(2000).optional().nullable(),
})

export async function listInvoices(opts: { search?: string; status?: string } = {}) {
  const filters = []
  if (opts.search) filters.push(ilike(schema.invoices.invoiceNumber, `%${opts.search}%`))
  if (opts.status && opts.status !== 'all') filters.push(eq(schema.invoices.status, opts.status as any))

  return db
    .select({
      id: schema.invoices.id,
      invoiceNumber: schema.invoices.invoiceNumber,
      status: schema.invoices.status,
      totalCents: schema.invoices.totalCents,
      currency: schema.invoices.currency,
      issueDate: schema.invoices.issueDate,
      dueDate: schema.invoices.dueDate,
      paidAt: schema.invoices.paidAt,
      customerId: schema.invoices.customerId,
      customerName: schema.customers.name,
    })
    .from(schema.invoices)
    .leftJoin(schema.customers, eq(schema.invoices.customerId, schema.customers.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.invoices.issueDate))
    .limit(200)
}

export async function invoiceCountsByStatus() {
  const rows = await db
    .select({ status: schema.invoices.status, count: count() })
    .from(schema.invoices)
    .groupBy(schema.invoices.status)
  const all = rows.reduce((sum, r) => sum + Number(r.count), 0)
  const map = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]))
  return { all, paid: map.paid ?? 0, pending: map.pending ?? 0, overdue: map.overdue ?? 0 }
}

export async function createInvoice(input: z.infer<typeof InvoiceInput>) {
  const data = InvoiceInput.parse(input)
  const [row] = await db
    .insert(schema.invoices)
    .values({
      invoiceNumber: '#' + newId().slice(0, 6).toUpperCase(),
      customerId: data.customerId ?? null,
      status: data.status,
      totalCents: data.totalCents,
      currency: data.currency,
      dueDate: data.dueDate ?? null,
      notes: data.notes ?? null,
    })
    .returning()
  return row
}

export async function markInvoicePaid(id: number) {
  const [row] = await db
    .update(schema.invoices)
    .set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.invoices.id, id))
    .returning()
  return row
}

export async function setInvoiceStatus(id: number, status: z.infer<typeof InvoiceInput>['status']) {
  const [row] = await db
    .update(schema.invoices)
    .set({ status, updatedAt: new Date(), paidAt: status === 'paid' ? new Date() : null })
    .where(eq(schema.invoices.id, id))
    .returning()
  return row
}

export async function deleteInvoices(ids: number[]) {
  if (!ids.length) return { deleted: 0 }
  const rows = await db.delete(schema.invoices).where(inArray(schema.invoices.id, ids)).returning({ id: schema.invoices.id })
  return { deleted: rows.length }
}
