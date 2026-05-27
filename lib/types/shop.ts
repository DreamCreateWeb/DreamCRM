// Client-safe shop types + pure helpers (no server-only deps), so client
// components can import labels/formatters. DB functions live in
// lib/services/shop.ts.

export type ProductCategory = 'whitening' | 'brushes' | 'flossers' | 'kids' | 'guards' | 'merch' | 'other'
export type ProductStatus = 'draft' | 'active' | 'archived'
export type Fulfillment = 'pickup' | 'ship' | 'both'
export type StripeAccountStatus = 'none' | 'pending' | 'active' | 'restricted'

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  whitening: 'Whitening',
  brushes: 'Toothbrushes',
  flossers: 'Flossers & Irrigators',
  kids: 'Kids',
  guards: 'Guards & Retainer Care',
  merch: 'Branded Merch',
  other: 'Other',
}
export const FULFILLMENT_LABELS: Record<Fulfillment, string> = {
  pickup: 'In-office pickup',
  ship: 'Ship to patient',
  both: 'Pickup or ship',
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export interface ProductVariantRow {
  id: string
  name: string
  sku: string | null
  priceCents: number
  compareAtCents: number | null
  inventoryQty: number | null
  options: Record<string, string>
  position: number
}

export interface ProductRow {
  id: string
  name: string
  slug: string
  description: string | null
  category: ProductCategory
  images: string[]
  status: ProductStatus
  fulfillment: Fulfillment
  fsaEligible: boolean
  featured: boolean
  position: number
  variants: ProductVariantRow[]
  // Derived for display.
  minPriceCents: number
  maxPriceCents: number
  totalInventory: number | null // null = any variant untracked
}

export interface ShopConfigView {
  stripeAccountStatus: StripeAccountStatus
  chargesEnabled: boolean
  payoutsEnabled: boolean
  pickupEnabled: boolean
  shippingEnabled: boolean
  flatShippingCents: number | null
  freeShippingThresholdCents: number | null
  taxEnabled: boolean
  platformFeeBps: number
  currency: string
  storefrontEnabled: boolean
  membershipEnabled: boolean
}

export interface ShopStats {
  productCount: number
  activeCount: number
}

/** Price range label, e.g. "$24.00" or "$12.00–$24.00". */
export function priceRangeLabel(p: Pick<ProductRow, 'minPriceCents' | 'maxPriceCents'>): string {
  if (p.minPriceCents === p.maxPriceCents) return formatCents(p.minPriceCents)
  return `${formatCents(p.minPriceCents)}–${formatCents(p.maxPriceCents)}`
}

// ── Form input shapes (shared client form ↔ server action) ────────────────
export interface VariantInput {
  id?: string
  name: string
  sku?: string | null
  priceDollars: number
  compareAtDollars?: number | null
  inventoryQty?: number | null
}

export interface ProductInput {
  id?: string
  name: string
  category: ProductCategory
  description?: string | null
  images: string[]
  fulfillment: Fulfillment
  status: ProductStatus
  fsaEligible: boolean
  featured: boolean
  variants: VariantInput[]
}

// ── Orders ────────────────────────────────────────────────────────────────
export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'refunded'
export type FulfillmentStatus = 'unfulfilled' | 'ready_for_pickup' | 'picked_up' | 'shipped' | 'delivered'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending payment',
  paid: 'Paid',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}
export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  unfulfilled: 'Unfulfilled',
  ready_for_pickup: 'Ready for pickup',
  picked_up: 'Picked up',
  shipped: 'Shipped',
  delivered: 'Delivered',
}

export interface OrderItemRow {
  productName: string
  variantName: string | null
  sku: string | null
  unitPriceCents: number
  quantity: number
}

export interface OrderRow {
  id: string
  email: string
  name: string | null
  phone: string | null
  patientId: string | null
  patientName: string | null
  fulfillmentType: 'pickup' | 'ship'
  status: OrderStatus
  fulfillmentStatus: FulfillmentStatus
  subtotalCents: number
  shippingCents: number
  taxCents: number
  discountCents: number
  totalCents: number
  trackingNumber: string | null
  shippingAddress: Record<string, string> | null
  items: OrderItemRow[]
  createdAt: Date
  paidAt: Date | null
  ageHours: number
}

// Client-side cart line (localStorage). Price is display-only — the server
// always re-prices from the DB at checkout.
export interface CartLine {
  variantId: string
  productSlug: string
  productName: string
  variantName: string
  priceCents: number
  image: string | null
  qty: number
}
