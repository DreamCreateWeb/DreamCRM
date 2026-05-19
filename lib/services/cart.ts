import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'

export type CartLine = {
  productId: number
  quantity: number
  name: string
  slug: string
  priceCents: number
  currency: string
  imageUrl: string | null
}

export async function listCart(userId: string, organizationId: string): Promise<CartLine[]> {
  const rows = await db
    .select({
      productId: schema.cartItems.productId,
      quantity: schema.cartItems.quantity,
      name: schema.products.name,
      slug: schema.products.slug,
      priceCents: schema.products.priceCents,
      currency: schema.products.currency,
      imageUrl: schema.products.imageUrl,
    })
    .from(schema.cartItems)
    .innerJoin(schema.products, eq(schema.cartItems.productId, schema.products.id))
    .where(
      and(
        eq(schema.cartItems.userId, userId),
        eq(schema.cartItems.organizationId, organizationId),
      ),
    )
  return rows
}

export async function cartTotal(userId: string, organizationId: string) {
  const lines = await listCart(userId, organizationId)
  const subtotalCents = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0)
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0)
  return { subtotalCents, itemCount, lines }
}

export async function addToCart(
  userId: string,
  organizationId: string,
  productId: number,
  quantity: number = 1,
) {
  const existing = await db
    .select()
    .from(schema.cartItems)
    .where(
      and(
        eq(schema.cartItems.userId, userId),
        eq(schema.cartItems.organizationId, organizationId),
        eq(schema.cartItems.productId, productId),
      ),
    )
    .limit(1)
  if (existing.length) {
    const [row] = await db
      .update(schema.cartItems)
      .set({ quantity: sql`${schema.cartItems.quantity} + ${quantity}` })
      .where(
        and(
          eq(schema.cartItems.userId, userId),
          eq(schema.cartItems.organizationId, organizationId),
          eq(schema.cartItems.productId, productId),
        ),
      )
      .returning()
    return row
  }
  const [row] = await db
    .insert(schema.cartItems)
    .values({ userId, organizationId, productId, quantity })
    .returning()
  return row
}

export async function updateCartQuantity(
  userId: string,
  organizationId: string,
  productId: number,
  quantity: number,
) {
  if (quantity <= 0) return removeFromCart(userId, organizationId, productId)
  const [row] = await db
    .update(schema.cartItems)
    .set({ quantity })
    .where(
      and(
        eq(schema.cartItems.userId, userId),
        eq(schema.cartItems.organizationId, organizationId),
        eq(schema.cartItems.productId, productId),
      ),
    )
    .returning()
  return row
}

export async function removeFromCart(
  userId: string,
  organizationId: string,
  productId: number,
) {
  await db
    .delete(schema.cartItems)
    .where(
      and(
        eq(schema.cartItems.userId, userId),
        eq(schema.cartItems.organizationId, organizationId),
        eq(schema.cartItems.productId, productId),
      ),
    )
  return { ok: true }
}

export async function clearCart(userId: string, organizationId: string) {
  await db
    .delete(schema.cartItems)
    .where(
      and(
        eq(schema.cartItems.userId, userId),
        eq(schema.cartItems.organizationId, organizationId),
      ),
    )
  return { ok: true }
}

export async function checkoutCart(userId: string, organizationId: string) {
  const { subtotalCents, lines } = await cartTotal(userId, organizationId)
  if (!lines.length) throw new Error('Cart is empty')
  const [order] = await db
    .insert(schema.orders)
    .values({
      organizationId,
      orderNumber: '#' + newId().slice(0, 6).toUpperCase(),
      customerId: null,
      status: 'processing',
      totalCents: subtotalCents,
      currency: lines[0].currency,
      items: lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        quantity: l.quantity,
        priceCents: l.priceCents,
      })),
    })
    .returning()
  await clearCart(userId, organizationId)
  return order
}
