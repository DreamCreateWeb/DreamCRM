import 'server-only'
import { and, desc, eq, ilike, inArray, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { slugify } from '@/lib/utils'

export const ProductInput = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  priceCents: z.number().int().min(0),
  currency: z.string().length(3).default('USD'),
  imageUrl: z.string().url().optional().nullable(),
  stock: z.number().int().min(0).default(0),
  category: z.string().max(80).optional().nullable(),
  active: z.boolean().optional(),
})

export async function listProducts(opts: { search?: string; category?: string; activeOnly?: boolean; limit?: number } = {}) {
  const filters = []
  if (opts.activeOnly ?? true) filters.push(eq(schema.products.active, true))
  if (opts.category) filters.push(eq(schema.products.category, opts.category))
  if (opts.search) {
    filters.push(
      or(
        ilike(schema.products.name, `%${opts.search}%`),
        ilike(schema.products.description, `%${opts.search}%`)
      )!
    )
  }
  return db
    .select()
    .from(schema.products)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.products.createdAt))
    .limit(opts.limit ?? 100)
}

export async function getProductBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.slug, slug))
    .limit(1)
  return row
}

export async function getProductById(id: number) {
  const [row] = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.id, id))
    .limit(1)
  return row
}

export async function createProduct(input: z.infer<typeof ProductInput>) {
  const data = ProductInput.parse(input)
  const [row] = await db
    .insert(schema.products)
    .values({
      name: data.name,
      slug: data.slug ?? slugify(data.name),
      description: data.description ?? null,
      priceCents: data.priceCents,
      currency: data.currency,
      imageUrl: data.imageUrl ?? null,
      stock: data.stock,
      category: data.category ?? null,
      active: data.active ?? true,
    })
    .returning()
  return row
}

export async function deleteProduct(id: number) {
  await db.delete(schema.products).where(eq(schema.products.id, id))
  return { ok: true }
}

export async function getProductsByIds(ids: number[]) {
  if (!ids.length) return []
  return db.select().from(schema.products).where(inArray(schema.products.id, ids))
}
