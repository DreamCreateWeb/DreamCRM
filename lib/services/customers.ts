import 'server-only'
import { and, desc, eq, inArray, ilike, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'

export const CustomerInput = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(40).optional().nullable(),
  location: z.string().max(120).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  fav: z.boolean().optional(),
})

export const CustomerUpdate = CustomerInput.partial()

export async function listCustomers(opts: { search?: string; archived?: boolean } = {}) {
  const filters = [eq(schema.customers.archived, opts.archived ?? false)]
  if (opts.search) {
    filters.push(
      or(
        ilike(schema.customers.name, `%${opts.search}%`),
        ilike(schema.customers.email, `%${opts.search}%`)
      )!
    )
  }
  return db
    .select()
    .from(schema.customers)
    .where(and(...filters))
    .orderBy(desc(schema.customers.createdAt))
}

export async function getCustomerOrderStats() {
  return db
    .select({
      customerId: schema.orders.customerId,
      orderCount: sql<number>`count(${schema.orders.id})::int`,
      totalSpentCents: sql<number>`coalesce(sum(${schema.orders.totalCents}), 0)::int`,
      lastOrderNumber: sql<string>`max(${schema.orders.orderNumber})`,
    })
    .from(schema.orders)
    .groupBy(schema.orders.customerId)
}

export async function createCustomer(input: z.infer<typeof CustomerInput>, ownerId: string) {
  const data = CustomerInput.parse(input)
  const [row] = await db
    .insert(schema.customers)
    .values({ ...data, ownerId })
    .returning()
  return row
}

export async function updateCustomer(id: number, input: z.infer<typeof CustomerUpdate>) {
  const data = CustomerUpdate.parse(input)
  const [row] = await db
    .update(schema.customers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.customers.id, id))
    .returning()
  return row
}

export async function toggleFav(id: number) {
  const [row] = await db
    .update(schema.customers)
    .set({ fav: sql`not ${schema.customers.fav}`, updatedAt: new Date() })
    .where(eq(schema.customers.id, id))
    .returning({ id: schema.customers.id, fav: schema.customers.fav })
  return row
}

export async function deleteCustomers(ids: number[]) {
  if (!ids.length) return { deleted: 0 }
  const rows = await db.delete(schema.customers).where(inArray(schema.customers.id, ids)).returning({ id: schema.customers.id })
  return { deleted: rows.length }
}
