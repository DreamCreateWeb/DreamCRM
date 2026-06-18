import 'server-only'
import { and, eq, ne, sql } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { priceCart, newOrderId } from './shop'
import { validateCoupon, markCouponUsed, claimSingleUseCoupon } from './coupons'
import { notifyOrgMembers } from './notifications'
import { sendNotificationEmail } from '@/lib/email'
import { normalizePhone, samePhone } from '@/lib/contact-normalize'

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

  // Block oversell before charging. The only stock gate was the storefront's
  // client-side `inStock` boolean (stale + bypassable); checkout itself never
  // checked, and the finalize-time decrement floors at 0 — which silently hides
  // an oversell. Reject here so the clinic never sells more than it has. Untracked
  // variants (inventoryQty null) are unlimited and skip the check.
  const oversold = lines.find((l) => l.inventoryQty != null && l.qty > l.inventoryQty)
  if (oversold) {
    const left = oversold.inventoryQty ?? 0
    throw new Error(
      left <= 0
        ? `${oversold.productName} is out of stock.`
        : `Only ${left} of ${oversold.productName} ${left === 1 ? 'is' : 'are'} left — please lower the quantity and try again.`,
    )
  }

  const shippingCents =
    fulfillmentType === 'ship'
      ? cfg.freeShippingThresholdCents != null && subtotalCents >= cfg.freeShippingThresholdCents
        ? 0
        : cfg.flatShippingCents ?? 0
      : 0

  // Validate any promo code against the cart subtotal.
  let discountCents = 0
  let couponId: string | null = null
  let couponSingleUse = false
  if (input.couponCode?.trim()) {
    const v = await validateCoupon(organizationId, input.couponCode, subtotalCents)
    if (!v.ok) throw new Error(v.error ?? 'That code isn’t valid.')
    discountCents = v.discountCents ?? 0
    couponId = v.couponId ?? null
    couponSingleUse = v.singleUse ?? false
  }

  // Persist the order BEFORE redirecting to Stripe; finalize on payment.
  const orderId = newOrderId()

  // Reserve a single-use code to THIS order BEFORE creating the Stripe session.
  // Without this, two concurrent checkouts both validate the same one-time code
  // (it isn't burned until finalize) and each gets its own discounted session —
  // the clinic eats the discount twice. An abandoned reservation frees itself
  // after the Stripe-session TTL so a code is never locked by an unpaid cart.
  if (couponId && couponSingleUse) {
    const reserved = await claimSingleUseCoupon(organizationId, couponId, orderId)
    if (!reserved) {
      throw new Error('That promo code has just been used — remove it to continue.')
    }
  }
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
  // Fee is computed on the DISCOUNTED subtotal — the customer is charged
  // subtotal + shipping − discount, so a fee on the pre-discount subtotal could
  // exceed the charge (Stripe rejects application_fee_amount > amount, blocking
  // checkout) or skim a fee on money never collected.
  const feeBaseCents = Math.max(subtotalCents - discountCents, 0)
  const feeAmount = cfg.platformFeeBps > 0 ? Math.round((feeBaseCents * cfg.platformFeeBps) / 10000) : 0

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

  // Link to an existing patient by email/phone (best-effort), normalized so a
  // case/format mismatch ("Bob@X.com" vs "bob@x.com", "(512) 555-0100" vs
  // "5125550100") still links. Email is matched case-insensitively in SQL;
  // phone is matched on digits via samePhone over a small candidate set.
  let patientId = order.patientId
  if (!patientId) {
    const emailLower = order.email.trim().toLowerCase()
    const [emailMatch] = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, organizationId),
          sql`lower(${schema.patient.email}) = ${emailLower}`,
        ),
      )
      .limit(1)
    patientId = emailMatch?.id ?? null
    if (!patientId && normalizePhone(order.phone)) {
      const candidates = await db
        .select({ id: schema.patient.id, phone: schema.patient.phone })
        .from(schema.patient)
        .where(
          and(
            eq(schema.patient.organizationId, organizationId),
            sql`${schema.patient.phone} is not null`,
          ),
        )
      patientId = candidates.find((c) => samePhone(c.phone, order.phone))?.id ?? null
    }
  }

  // Atomically claim the order (pending → paid). Only the caller that actually
  // flips it runs the side-effects below: the /shop/success page AND the Connect
  // webhook both finalize, and without this compare-and-swap a near-simultaneous
  // double-fire would burn the coupon twice + decrement inventory twice.
  const claimed = await db
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
    .where(and(eq(schema.shopOrder.id, order.id), ne(schema.shopOrder.status, 'paid')))
    .returning({ id: schema.shopOrder.id })
  if (claimed.length === 0) return { ...order, status: 'paid', patientId } // another finalize won the race

  // Burn a single-use coupon now that the order is paid.
  if (order.couponId) await markCouponUsed(order.organizationId, order.couponId, order.id)

  // Decrement tracked inventory.
  const items = await db.select().from(schema.shopOrderItem).where(eq(schema.shopOrderItem.orderId, order.id))
  for (const it of items) {
    if (!it.variantId) continue
    await db
      .update(schema.shopProductVariant)
      .set({ inventoryQty: sql`greatest(${schema.shopProductVariant.inventoryQty} - ${it.quantity}, 0)` })
      .where(
        and(
          eq(schema.shopProductVariant.organizationId, order.organizationId),
          eq(schema.shopProductVariant.id, it.variantId),
          sql`${schema.shopProductVariant.inventoryQty} is not null`,
        ),
      )
  }

  // Tell the clinic a real order just came in — best-effort, never blocks the
  // finalize. (a) in-app notification to owners/admins; (b) an email to the
  // clinic's own contact address (same pattern as the contact-form lead email).
  const orderTotalCents = session.amount_total ?? order.totalCents
  const itemCount = items.reduce((n, it) => n + (it.quantity ?? 0), 0)
  await notifyOrderReceived({
    organizationId: order.organizationId,
    title: `Paid order — ${itemCount} ${itemCount === 1 ? 'item' : 'items'}, ${dollarsFromCents(orderTotalCents)}`,
    body: `${order.name || order.email} just paid for ${items.map((it) => `${it.quantity}× ${it.productName}`).join(', ') || 'an order'}.`,
    linkPath: '/shop/orders',
  })

  return { ...order, status: 'paid', patientId }
}

/** Compact dollar string from cents for clinic notifications. */
function dollarsFromCents(cents: number): string {
  return `$${(Number(cents) / 100).toFixed(2)}`
}

/**
 * Best-effort "money just came in" alert to the clinic — an in-app notification
 * to owners/admins + an email to the clinic's own contact address. Swallows its
 * own errors so a notification/email failure never breaks order finalization.
 */
async function notifyOrderReceived(input: {
  organizationId: string
  title: string
  body: string
  linkPath: string
}): Promise<void> {
  try {
    await notifyOrgMembers(
      input.organizationId,
      // 'comments' = clinic "Patient activity" bucket (default ON), the right
      // home for "a patient just paid you" — not 'offers' (billing/platform, OFF).
      { bucket: 'comments', type: 'shop_order_paid', title: input.title, body: input.body, linkPath: input.linkPath },
      { roles: ['owner', 'admin'] },
    )
  } catch (err) {
    console.warn('[shop-checkout] notifyOrgMembers failed', err)
  }
  try {
    const [profile] = await db
      .select({ email: schema.clinicProfile.email })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, input.organizationId))
      .limit(1)
    if (profile?.email) {
      await sendNotificationEmail({
        to: profile.email,
        name: null,
        title: input.title,
        body: input.body,
        linkPath: input.linkPath,
      })
    }
  } catch (err) {
    console.warn('[shop-checkout] clinic order email failed', err)
  }
}
