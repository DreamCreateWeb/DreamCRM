import 'server-only'
import { and, desc, eq, gte, ilike, inArray, lte, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'

export const OrderItem = z.object({
  productId: z.number().int().optional(),
  name: z.string().min(1).max(200),
  quantity: z.number().int().min(1).default(1),
  priceCents: z.number().int().min(0),
})

export const OrderInput = z.object({
  customerId: z.number().int().nullable().optional(),
  status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).default('pending'),
  totalCents: z.number().int().min(0),
  currency: z.string().length(3).default('USD'),
  location: z.string().max(120).optional().nullable(),
  items: z.array(OrderItem).default([]),
})

export type OrderListItem = Awaited<ReturnType<typeof listOrders>>[number]

export async function listOrders(opts: { search?: string; status?: string; from?: Date; to?: Date } = {}) {
  const filters = []
  if (opts.search) {
    filters.push(
      or(
        ilike(schema.orders.orderNumber, `%${opts.search}%`),
        ilike(schema.orders.location, `%${opts.search}%`)
      )!
    )
  }
  if (opts.status) filters.push(eq(schema.orders.status, opts.status as any))
  if (opts.from) filters.push(gte(schema.orders.createdAt, opts.from))
  if (opts.to) filters.push(lte(schema.orders.createdAt, opts.to))

  return db
    .select({
      id: schema.orders.id,
      orderNumber: schema.orders.orderNumber,
      status: schema.orders.status,
      totalCents: schema.orders.totalCents,
      currency: schema.orders.currency,
      location: schema.orders.location,
      items: schema.orders.items,
      createdAt: schema.orders.createdAt,
      customerId: schema.orders.customerId,
      customerName: schema.customers.name,
    })
    .from(schema.orders)
    .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.orders.createdAt))
    .limit(200)
}

export async function createOrder(input: z.infer<typeof OrderInput>) {
  const data = OrderInput.parse(input)
  const [row] = await db
    .insert(schema.orders)
    .values({
      orderNumber: '#' + newId().slice(0, 6).toUpperCase(),
      customerId: data.customerId ?? null,
      status: data.status,
      totalCents: data.totalCents,
      currency: data.currency,
      location: data.location ?? null,
      items: data.items,
    })
    .returning()
  return row
}

export async function updateOrderStatus(id: number, status: z.infer<typeof OrderInput>['status']) {
  const [row] = await db
    .update(schema.orders)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.orders.id, id))
    .returning()
  return row
}

export async function deleteOrders(ids: number[]) {
  if (!ids.length) return { deleted: 0 }
  const rows = await db.delete(schema.orders).where(inArray(schema.orders.id, ids)).returning({ id: schema.orders.id })
  return { deleted: rows.length }
}
