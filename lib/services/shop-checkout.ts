import 'server-only'
import { and, eq, or, sql } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { priceCart, newOrderId } from './shop'
import { validateCoupon, markCouponUsed } from './coupons'

/**
 * Shop checkout — creates a Stripe Checkout Session ON THE CLINIC'S CONNECTED
 * ACCOUNT (direct charge, Standard) so the customer's card is charged by the
 * clinic and the money settles to their bank. The platform can skim an
 * optional application fee. Order finalization (mark paid, decrement stock,
 * link patient) is idempotent and driven by either the success-page
 * reconciliation or the Connect webhook — whichever fires first.
 */

export interface CheckoutInput {
  items: Array<{ variantId: string; qty: number }>
  fulfillmentType: 'pickup' | 'ship'
  email: string
  name?: string | null
  phone?: string | null
  couponCode?: string | null
}

async function connectedAccount(organizationId: string) {
  const [row] = await db
    .select({
      accountId: schema.shopConfig.stripeAccountId,
      status: schema.shopConfig.stripeAccountStatus,
      charges: schema.shopConfig.chargesEnabled,
      shippingEnabled: schema.shopConfig.shippingEnabled,
      pickupEnabled: schema.shopConfig.pickupEnabled,
      flatShippingCents: schema.shopConfig.flatShippingCents,
      freeShippingThresholdCents: schema.shopConfig.freeShippingThresholdCents,
      taxEnabled: schema.shopConfig.taxEnabled,
      platformFeeBps: schema.shopConfig.platformFeeBps,
      currency: schema.shopConfig.currency,
    })
    .from(schema.shopConfig)
    .where(eq(schema.shopConfig.organizationId, organizationId))
    .limit(1)
  return row ?? null
}

export async function createShopCheckoutSession(
  organizationId: string,
  baseUrl: string,
  input: CheckoutInput,
): Promise<{ url: string }> {
  const cfg = await connectedAccount(organizationId)
  if (!cfg?.accountId || cfg.status !== 'active' || cfg.charges !== 1) {
    throw new Error('This shop isn’t set up to accept payments yet.')
  }
  if (!input.email) throw new Error('An email is required to check out.')

  const fulfillmentType = input.fulfillmentType === 'ship' && cfg.shippingEnabled === 1 ? 'ship' : 'pickup'
  if (input.fulfillmentType === 'ship' && cfg.shippingEnabled !== 1) {
    throw new Error('Shipping isn’t available — choose in-office pickup.')
  }

  const { lines, subtotalCents } = await priceCart(organizationId, input.items)
  if (lines.length === 0) throw new Error('Your cart is empty.')

  const shippingCents =
    fulfillmentType === 'ship'
      ? cfg.freeShippingThresholdCents != null && subtotalCents >= cfg.freeShippingThresholdCents
        ? 0
        : cfg.flatShippingCents ?? 0
      : 0

  // Validate any promo code against the cart subtotal.
  let discountCents = 0
  let couponId: string | null = null
  if (input.couponCode?.trim()) {
    const v = await validateCoupon(organizationId, input.couponCode, subtotalCents)
    if (!v.ok) throw new Error(v.error ?? 'That code isn’t valid.')
    discountCents = v.discountCents ?? 0
    couponId = v.couponId ?? null
  }

  // Persist the order BEFORE redirecting to Stripe; finalize on payment.
  const orderId = newOrderId()
  await db.insert(schema.shopOrder).values({
    id: orderId,
    organizationId,
    email: input.email,
    name: input.name ?? null,
    phone: input.phone ?? null,
    fulfillmentType,
    status: 'pending',
    fulfillmentStatus: 'unfulfilled',
    subtotalCents,
    shippingCents,
    taxCents: 0,
    discountCents,
    couponId,
    totalCents: Math.max(subtotalCents + shippingCents - discountCents, 0),
  })
  await db.insert(schema.shopOrderItem).values(
    lines.map((l) => ({
      id: `oi_${randomBytes(8).toString('hex')}`,
      orderId,
      organizationId,
      variantId: l.variantId,
      productName: l.productName,
      variantName: l.variantName === 'Default' ? null : l.variantName,
      unitPriceCents: l.unitPriceCents,
      quantity: l.qty,
    })),
  )

  const currency = cfg.currency || 'usd'
  const feeAmount = cfg.platformFeeBps > 0 ? Math.round((subtotalCents * cfg.platformFeeBps) / 10000) : 0

  const lineItems = lines.map((l) => ({
    quantity: l.qty,
    price_data: {
      currency,
      unit_amount: l.unitPriceCents,
      product_data: { name: l.variantName === 'Default' ? l.productName : `${l.productName} — ${l.variantName}` },
    },
  }))

  const params: Record<string, unknown> = {
    mode: 'payment',
    line_items: lineItems,
    customer_email: input.email,
    success_url: `${baseUrl}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/shop`,
    metadata: { orderId, organizationId },
    payment_intent_data: {
      metadata: { orderId, organizationId },
      ...(feeAmount > 0 ? { application_fee_amount: feeAmount } : {}),
    },
    // Sales tax only computes with an address → ship orders only, when enabled.
    automatic_tax: { enabled: cfg.taxEnabled === 1 && fulfillmentType === 'ship' },
  }
  if (fulfillmentType === 'ship') {
    params.shipping_address_collection = { allowed_countries: ['US'] }
    params.shipping_options = [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: shippingCents, currency },
          display_name: shippingCents === 0 ? 'Free shipping' : 'Standard shipping',
        },
      },
    ]
  }
  // Apply the discount as a one-time Stripe coupon on the connected account
  // (exact computed amount, so percent/amount codes behave identically).
  if (discountCents > 0) {
    const stripeCoupon = await stripe.coupons.create(
      { amount_off: discountCents, currency, duration: 'once', max_redemptions: 1 },
      { stripeAccount: cfg.accountId },
    )
    params.discounts = [{ coupon: stripeCoupon.id }]
  }

  const session = await stripe.checkout.sessions.create(params as never, { stripeAccount: cfg.accountId })

  await db
    .update(schema.shopOrder)
    .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
    .where(eq(schema.shopOrder.id, orderId))

  if (!session.url) throw new Error('Stripe did not return a checkout URL.')
  return { url: session.url }
}

/**
 * Idempotently finalize an order once Stripe confirms payment. Safe to call
 * from both the success page and the webhook — only the first run mutates.
 */
export async function finalizeOrderFromSession(organizationId: string, sessionId: string): Promise<schema.ShopOrder | null> {
  const [order] = await db
    .select()
    .from(schema.shopOrder)
    .where(and(eq(schema.shopOrder.organizationId, organizationId), eq(schema.shopOrder.stripeCheckoutSessionId, sessionId)))
    .limit(1)
  if (!order) return null
  if (order.status === 'paid') return order // already finalized

  const cfg = await connectedAccount(organizationId)
  if (!cfg?.accountId) return order

  const session = await stripe.checkout.sessions.retrieve(sessionId, undefined, { stripeAccount: cfg.accountId })
  if (session.payment_status !== 'paid') return order // still pending / abandoned

  const shippingAddr = (session.collected_information?.shipping_details?.address ??
    session.customer_details?.address ??
    null) as Record<string, string> | null

  // Link to an existing patient by email/phone (best-effort).
  let patientId = order.patientId
  if (!patientId) {
    const [match] = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, organizationId),
          or(eq(schema.patient.email, order.email), order.phone ? eq(schema.patient.phone, order.phone) : sql`false`)!,
        ),
      )
      .limit(1)
    patientId = match?.id ?? null
  }

  await db
    .update(schema.shopOrder)
    .set({
      status: 'paid',
      paidAt: new Date(),
      patientId,
      shippingAddress: shippingAddr,
      subtotalCents: session.amount_subtotal ?? order.subtotalCents,
      shippingCents: session.total_details?.amount_shipping ?? order.shippingCents,
      taxCents: session.total_details?.amount_tax ?? 0,
      totalCents: session.amount_total ?? order.totalCents,
      stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      fulfillmentStatus: order.fulfillmentType === 'pickup' ? 'ready_for_pickup' : 'unfulfilled',
      updatedAt: new Date(),
    })
    .where(eq(schema.shopOrder.id, order.id))

  // Burn a single-use coupon now that the order is paid.
  if (order.couponId) await markCouponUsed(order.organizationId, order.couponId, order.id)

  // Decrement tracked inventory.
  const items = await db.select().from(schema.shopOrderItem).where(eq(schema.shopOrderItem.orderId, order.id))
  for (const it of items) {
    if (!it.variantId) continue
    await db
      .update(schema.shopProductVariant)
      .set({ inventoryQty: sql`greatest(${schema.shopProductVariant.inventoryQty} - ${it.quantity}, 0)` })
      .where(and(eq(schema.shopProductVariant.id, it.variantId), sql`${schema.shopProductVariant.inventoryQty} is not null`))
  }

  return { ...order, status: 'paid', patientId }
}
