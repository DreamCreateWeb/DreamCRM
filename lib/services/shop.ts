import 'server-only'
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import { slugify } from '@/lib/utils'
import type {
  ProductRow,
  ProductVariantRow,
  ProductInput,
  ShopConfigView,
  ShopStats,
  ProductCategory,
  ProductStatus,
  Fulfillment,
  StripeAccountStatus,
} from '@/lib/types/shop'

/**
 * Shop service — dental product retail (membership plans live in
 * lib/services/membership.ts). Catalog CRUD + per-org commerce config.
 * Client-safe types + labels are in lib/types/shop.ts.
 */

export type {
  ProductRow,
  ProductVariantRow,
  ProductInput,
  ShopConfigView,
  ShopStats,
} from '@/lib/types/shop'

export function newProductId(): string {
  return `prod_${randomBytes(10).toString('hex')}`
}
export function newVariantId(): string {
  return `var_${randomBytes(10).toString('hex')}`
}

/** True when the platform has wired Stripe Connect (client id present). Gates
 * the onboarding UI the same way gscOAuthConfigured() gates Search Console. */
export function shopConnectConfigured(): boolean {
  return Boolean(process.env.STRIPE_CONNECT_CLIENT_ID)
}

// ── Config ────────────────────────────────────────────────────────────────

export async function getShopConfig(organizationId: string): Promise<ShopConfigView> {
  const [row] = await db
    .select()
    .from(schema.shopConfig)
    .where(eq(schema.shopConfig.organizationId, organizationId))
    .limit(1)
  if (!row) {
    return {
      stripeAccountStatus: 'none',
      chargesEnabled: false,
      payoutsEnabled: false,
      pickupEnabled: true,
      shippingEnabled: false,
      flatShippingCents: null,
      freeShippingThresholdCents: null,
      taxEnabled: false,
      platformFeeBps: 0,
      currency: 'usd',
      storefrontEnabled: false,
      membershipEnabled: false,
    }
  }
  return {
    stripeAccountStatus: row.stripeAccountStatus as StripeAccountStatus,
    chargesEnabled: row.chargesEnabled === 1,
    payoutsEnabled: row.payoutsEnabled === 1,
    pickupEnabled: row.pickupEnabled === 1,
    shippingEnabled: row.shippingEnabled === 1,
    flatShippingCents: row.flatShippingCents,
    freeShippingThresholdCents: row.freeShippingThresholdCents,
    taxEnabled: row.taxEnabled === 1,
    platformFeeBps: row.platformFeeBps,
    currency: row.currency,
    storefrontEnabled: row.storefrontEnabled === 1,
    membershipEnabled: row.membershipEnabled === 1,
  }
}

async function ensureShopConfig(organizationId: string): Promise<void> {
  await db
    .insert(schema.shopConfig)
    .values({ organizationId })
    .onConflictDoNothing({ target: schema.shopConfig.organizationId })
}

export interface ShopConfigPatch {
  pickupEnabled?: boolean
  shippingEnabled?: boolean
  taxEnabled?: boolean
  storefrontEnabled?: boolean
  membershipEnabled?: boolean
  flatShippingCents?: number | null
  freeShippingThresholdCents?: number | null
  platformFeeBps?: number
}

export async function updateShopConfig(organizationId: string, patch: ShopConfigPatch): Promise<void> {
  await ensureShopConfig(organizationId)
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.pickupEnabled !== undefined) set.pickupEnabled = patch.pickupEnabled ? 1 : 0
  if (patch.shippingEnabled !== undefined) set.shippingEnabled = patch.shippingEnabled ? 1 : 0
  if (patch.taxEnabled !== undefined) set.taxEnabled = patch.taxEnabled ? 1 : 0
  if (patch.storefrontEnabled !== undefined) set.storefrontEnabled = patch.storefrontEnabled ? 1 : 0
  if (patch.membershipEnabled !== undefined) set.membershipEnabled = patch.membershipEnabled ? 1 : 0
  if (patch.flatShippingCents !== undefined) set.flatShippingCents = patch.flatShippingCents
  if (patch.freeShippingThresholdCents !== undefined) set.freeShippingThresholdCents = patch.freeShippingThresholdCents
  if (patch.platformFeeBps !== undefined) set.platformFeeBps = patch.platformFeeBps
  await db.update(schema.shopConfig).set(set).where(eq(schema.shopConfig.organizationId, organizationId))
}

// ── Products + variants ─────────────────────────────────────────────────

function rollupVariants(variants: ProductVariantRow[]): {
  minPriceCents: number
  maxPriceCents: number
  totalInventory: number | null
} {
  if (variants.length === 0) return { minPriceCents: 0, maxPriceCents: 0, totalInventory: 0 }
  const prices = variants.map((v) => v.priceCents)
  const anyUntracked = variants.some((v) => v.inventoryQty == null)
  const totalInventory = anyUntracked ? null : variants.reduce((s, v) => s + (v.inventoryQty ?? 0), 0)
  return { minPriceCents: Math.min(...prices), maxPriceCents: Math.max(...prices), totalInventory }
}

function toVariantRow(v: typeof schema.shopProductVariant.$inferSelect): ProductVariantRow {
  return {
    id: v.id,
    name: v.name,
    sku: v.sku,
    priceCents: v.priceCents,
    compareAtCents: v.compareAtCents,
    inventoryQty: v.inventoryQty,
    options: v.options,
    position: v.position,
  }
}

function toProductRow(p: typeof schema.shopProduct.$inferSelect, variants: ProductVariantRow[]): ProductRow {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    category: p.category as ProductCategory,
    images: p.images,
    status: p.status as ProductStatus,
    fulfillment: p.fulfillment as Fulfillment,
    fsaEligible: p.fsaEligible === 1,
    featured: p.featured === 1,
    position: p.position,
    variants,
    ...rollupVariants(variants),
  }
}

async function variantsByProduct(productIds: string[]): Promise<Map<string, ProductVariantRow[]>> {
  const out = new Map<string, ProductVariantRow[]>()
  if (productIds.length === 0) return out
  const rows = await db
    .select()
    .from(schema.shopProductVariant)
    .where(inArray(schema.shopProductVariant.productId, productIds))
    .orderBy(asc(schema.shopProductVariant.position))
  for (const r of rows) {
    const list = out.get(r.productId) ?? []
    list.push(toVariantRow(r))
    out.set(r.productId, list)
  }
  return out
}

export async function listProducts(organizationId: string): Promise<ProductRow[]> {
  const products = await db
    .select()
    .from(schema.shopProduct)
    .where(eq(schema.shopProduct.organizationId, organizationId))
    .orderBy(asc(schema.shopProduct.position), desc(schema.shopProduct.createdAt))
  const variants = await variantsByProduct(products.map((p) => p.id))
  return products.map((p) => toProductRow(p, variants.get(p.id) ?? []))
}

export async function getProduct(organizationId: string, id: string): Promise<ProductRow | null> {
  const [p] = await db
    .select()
    .from(schema.shopProduct)
    .where(and(eq(schema.shopProduct.organizationId, organizationId), eq(schema.shopProduct.id, id)))
    .limit(1)
  if (!p) return null
  const variants = await variantsByProduct([p.id])
  return toProductRow(p, variants.get(p.id) ?? [])
}

export async function listActiveProducts(organizationId: string): Promise<ProductRow[]> {
  return (await listProducts(organizationId)).filter((p) => p.status === 'active')
}

export async function getActiveProductBySlug(organizationId: string, slug: string): Promise<ProductRow | null> {
  const [p] = await db
    .select()
    .from(schema.shopProduct)
    .where(
      and(
        eq(schema.shopProduct.organizationId, organizationId),
        eq(schema.shopProduct.slug, slug),
        eq(schema.shopProduct.status, 'active'),
      ),
    )
    .limit(1)
  if (!p) return null
  const variants = await variantsByProduct([p.id])
  return toProductRow(p, variants.get(p.id) ?? [])
}

async function uniqueProductSlug(organizationId: string, name: string, excludeId?: string): Promise<string> {
  const base = slugify(name) || 'product'
  const existing = await db
    .select({ slug: schema.shopProduct.slug, id: schema.shopProduct.id })
    .from(schema.shopProduct)
    .where(eq(schema.shopProduct.organizationId, organizationId))
  const taken = new Set(existing.filter((e) => e.id !== excludeId).map((e) => e.slug))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

function dollarsToCents(d: number | null | undefined): number | null {
  if (d == null || isNaN(d)) return null
  return Math.round(d * 100)
}

/** Create or update a product + replace its variant set. */
export async function saveProduct(organizationId: string, input: ProductInput): Promise<string> {
  const cleanVariants = input.variants
    .filter((v) => v.name.trim().length > 0)
    .map((v, i) => ({
      id: v.id ?? newVariantId(),
      name: v.name.trim(),
      sku: v.sku?.trim() || null,
      priceCents: dollarsToCents(v.priceDollars) ?? 0,
      compareAtCents: dollarsToCents(v.compareAtDollars ?? null),
      inventoryQty: v.inventoryQty ?? null,
      position: i,
    }))
  if (cleanVariants.length === 0) {
    cleanVariants.push({ id: newVariantId(), name: 'Default', sku: null, priceCents: 0, compareAtCents: null, inventoryQty: null, position: 0 })
  }

  const productId = input.id ?? newProductId()
  const slug = await uniqueProductSlug(organizationId, input.name, input.id)
  const base = {
    name: input.name.trim(),
    slug,
    description: input.description?.trim() || null,
    category: input.category,
    images: input.images,
    status: input.status,
    fulfillment: input.fulfillment,
    fsaEligible: input.fsaEligible ? 1 : 0,
    featured: input.featured ? 1 : 0,
    updatedAt: new Date(),
  }

  if (input.id) {
    await db.update(schema.shopProduct).set(base).where(
      and(eq(schema.shopProduct.organizationId, organizationId), eq(schema.shopProduct.id, productId)),
    )
    // Replace variants wholesale — simplest correct approach for v1.
    await db.delete(schema.shopProductVariant).where(eq(schema.shopProductVariant.productId, productId))
  } else {
    await db.insert(schema.shopProduct).values({ id: productId, organizationId, ...base })
  }

  await db.insert(schema.shopProductVariant).values(
    cleanVariants.map((v) => ({ ...v, productId, organizationId })),
  )
  return productId
}

export async function setProductStatus(organizationId: string, id: string, status: ProductStatus): Promise<void> {
  await db
    .update(schema.shopProduct)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(schema.shopProduct.organizationId, organizationId), eq(schema.shopProduct.id, id)))
}

export async function deleteProduct(organizationId: string, id: string): Promise<void> {
  await db
    .delete(schema.shopProduct)
    .where(and(eq(schema.shopProduct.organizationId, organizationId), eq(schema.shopProduct.id, id)))
}

export async function getShopStats(organizationId: string): Promise<ShopStats> {
  const rows = await db
    .select({ status: schema.shopProduct.status, c: count() })
    .from(schema.shopProduct)
    .where(eq(schema.shopProduct.organizationId, organizationId))
    .groupBy(schema.shopProduct.status)
  let productCount = 0
  let activeCount = 0
  for (const r of rows) {
    const n = Number(r.c)
    productCount += n
    if (r.status === 'active') activeCount = n
  }
  return { productCount, activeCount }
}
