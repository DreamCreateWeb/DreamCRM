import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { priceCart, newOrderId } from './shop'
import { validateCoupon, markCouponUsed, claimSingleUseCoupon, releaseSingleUseCoupon } from './coupons'
import { CheckoutError } from './checkout-error'
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
    throw new CheckoutError('This shop isn’t set up to accept payments yet.')
  }
  if (!input.email) throw new CheckoutError('An email is required to check out.')

  const fulfillmentType = input.fulfillmentType === 'ship' && cfg.shippingEnabled === 1 ? 'ship' : 'pickup'
  if (input.fulfillmentType === 'ship' && cfg.shippingEnabled !== 1) {
    throw new CheckoutError('Shipping isn’t available — choose in-office pickup.')
  }

  const { lines, subtotalCents } = await priceCart(organizationId, input.items)
  if (lines.length === 0) throw new CheckoutError('Your cart is empty.')

  // Block oversell before charging. The only stock gate was the storefront's
  // client-side `inStock` boolean (stale + bypassable); checkout itself never
  // checked, and the finalize-time decrement floors at 0 — which silently hides
  // an oversell. Reject here so the clinic never sells more than it has. Untracked
  // variants (inventoryQty null) are unlimited and skip the check.
  const oversold = lines.find((l) => l.inventoryQty != null && l.qty > l.inventoryQty)
  if (oversold) {
    const left = oversold.inventoryQty ?? 0
    throw new CheckoutError(
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
    if (!v.ok) throw new CheckoutError(v.error ?? 'That code isn’t valid.')
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
      throw new CheckoutError('That promo code has just been used — remove it to continue.')
    }
  }

  // Everything from here writes the order into OUR database before it exists at
  // Stripe, so a failure in between leaves a half-finished sale behind: a
  // 'pending' order sitting in the clinic's Orders list looking real, and a
  // single-use promo code locked to it for a full day. A Stripe outage is
  // exactly that failure. Undo both, then rethrow — the caller decides what the
  // patient reads.
  try {
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

    // A hosted session always carries a URL; no URL means we cannot send the
    // patient anywhere. Not a message we wrote for them — the caller maps it.
    if (!session.url) throw new Error('Stripe returned a checkout session with no URL')
    return { url: session.url }
  } catch (err) {
    await discardUnstartedOrder(organizationId, orderId, couponSingleUse ? couponId : null)
    throw err
  }
}

/**
 * Undo an order that never made it to Stripe.
 *
 * WHY THIS IS SAFE, precisely: because NO CHECKOUT URL WAS EVER HANDED OUT —
 * never because of a predicate on `stripe_checkout_session_id`. The only caller
 * is the catch block above, which rethrows instead of returning, so the patient
 * is never sent to the hosted page and the session can never be paid;
 * `finalizeOrderFromSession` will never be called for it. Anyone widening that
 * catch (returning a URL on some failure path, say) breaks the guarantee and
 * has to re-earn it here.
 *
 * THE `IS NULL` PREDICATE IS GONE, and it is worth saying why rather than just
 * deleting it. It never did the job it was credited with — "cannot collide
 * with the finalizer's lookup key" — because the case it would have to catch
 * is `sessions.create` succeeding and the id-stamp UPDATE then throwing, which
 * leaves the column NULL and was deleted anyway. What it DID do was strand the
 * one path it sat in front of: `!session.url` throws one line AFTER the
 * id-stamp, so the column is set, the delete matched nothing, and a phantom
 * 'pending' order stayed in the clinic's Orders list with its promo code locked
 * to it for 24h. Same choice, same reason, as
 * `discardUnstartedBalancePayment` (DREAMCRM-20).
 *
 * Name what retiring that phrase COSTS, since it was gesturing at something
 * real: on the `!session.url` path we now delete a row whose session id IS
 * stamped, so a session that somehow got paid would leave
 * `finalizeOrderFromSession` finding no order and returning null — money on
 * the clinic's connected account with nothing behind it. That needs a payable
 * session nobody can reach, because the URL never leaves this function. A
 * guaranteed phantom order on every no-URL checkout is a worse trade than an
 * orphan requiring an impossible precondition, and that is the trade this
 * takes deliberately.
 *
 * The scope that remains is the scope that was ever load-bearing: this org,
 * this exact `orderId` — minted by this call from 10 random bytes, never
 * reused — and `status='pending'`, which keeps a paid or refunded order out of
 * reach entirely. `shop_order_item.order_id` cascades, so the lines go with the
 * order.
 *
 * THE COUPON RELEASE, RE-EARNED against the wider delete. The reservation may
 * only be handed back once the order it was held for is really gone, and there
 * are exactly three ways this function can end:
 *
 *   1. the delete removed the row — gone, release. This is the case the old
 *      predicate excluded on the `!session.url` path, and excluding it is what
 *      re-created the "already used" lockout in Postgres that the Stripe-side
 *      TTL was there to avoid.
 *   2. the delete matched nothing AND no row exists — the order insert itself
 *      failed, after the claim. Never written is as gone as deleted; release.
 *   3. the delete matched nothing and a row IS still there — which, now that
 *      the session id no longer narrows the delete, can only mean the order is
 *      no longer 'pending'. Something else owns it, the discount is attached to
 *      it, and the code stays held. This is the one case that must NOT release,
 *      and the survivor lookup is what decides it — not the predicate.
 *
 * Best-effort: a failed cleanup must never replace the real error (a Stripe
 * outage) with a database one in front of the patient. The worst case is the
 * phantom order we already had.
 */
async function discardUnstartedOrder(
  organizationId: string,
  orderId: string,
  singleUseCouponId: string | null,
): Promise<void> {
  try {
    const removed = await db
      .delete(schema.shopOrder)
      .where(
        and(
          eq(schema.shopOrder.organizationId, organizationId),
          eq(schema.shopOrder.id, orderId),
          eq(schema.shopOrder.status, 'pending'),
        ),
      )
      .returning({ id: schema.shopOrder.id })

    // Give the code back only once the order it was held for is really gone —
    // which is EITHER because we just deleted it, OR because it was never
    // written at all. The claim happens before the order insert, so a failure
    // of that insert (the DB blip the generic message anticipates) leaves a
    // reservation pointing at an order id that does not exist: the delete
    // matches nothing, and gating on that alone would re-create the same 24h
    // "already used" lockout via Postgres instead of Stripe. See the three
    // cases in the doc comment — a surviving row now means only "no longer
    // pending", which is the one case that must keep holding the code.
    let orderIsGone = removed.length > 0
    if (!orderIsGone) {
      const [survivor] = await db
        .select({ id: schema.shopOrder.id })
        .from(schema.shopOrder)
        .where(
          and(eq(schema.shopOrder.organizationId, organizationId), eq(schema.shopOrder.id, orderId)),
        )
        .limit(1)
      orderIsGone = !survivor
    }
    if (orderIsGone && singleUseCouponId) {
      await releaseSingleUseCoupon(organizationId, singleUseCouponId, orderId)
    }
  } catch (err) {
    console.warn('[shop-checkout] could not clean up an unstarted order', { orderId }, err)
  }
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
  // TERMINAL states. 'refunded' matters as much as 'paid' here: a Stripe
  // refund does NOT change the Checkout Session's payment_status, and the
  // success page finalizes on every load from an unauthenticated GET the
  // shopper still has in their history. Without this, reopening that page
  // after a refund walks the whole finalize path again — writing the order
  // back to 'paid', resetting paidAt, burning a single-use coupon a second
  // time, decrementing stock a second time, and telling the clinic it was
  // paid for money it just sent back.
  if (order.status === 'paid' || order.status === 'refunded') return order

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
    // A POSITIVE predicate: claim the order only while it is still awaiting
    // payment. The early return above covers the sequential path; THIS is
    // what has to hold under a race, and `ne(status, 'paid')` had to be
    // widened by hand every time a status value was added — it already let
    // 'cancelled' through, and 'refunded' inherited the same hole.
    .where(and(eq(schema.shopOrder.id, order.id), eq(schema.shopOrder.status, 'pending')))
    .returning({ id: schema.shopOrder.id })
  if (claimed.length === 0) {
    // Another finalize won the race — report the row as it ACTUALLY stands.
    //
    // This used to return a hardcoded 'paid', which was accurate while the
    // only way to lose the claim was another writer setting 'paid'. The claim
    // predicate above is now the POSITIVE `status = 'pending'`, so a
    // 'cancelled' order whose Stripe session reads paid loses the claim too —
    // and the success page renders "your order is confirmed!" off this status.
    // Nothing is written and no money moves either way; the only thing at
    // stake is whether the shopper is told the truth.
    const [current] = await db
      .select({ status: schema.shopOrder.status, patientId: schema.shopOrder.patientId })
      .from(schema.shopOrder)
      .where(and(eq(schema.shopOrder.organizationId, organizationId), eq(schema.shopOrder.id, order.id)))
      .limit(1)
    // No row left to read (a delete raced us) is not a reason to invent one:
    // fall back to what we read on the way in, never to 'paid'.
    return { ...order, status: current?.status ?? order.status, patientId: current?.patientId ?? patientId }
  }

  // Burn a single-use coupon now that the order is paid.
  if (order.couponId) await markCouponUsed(order.organizationId, order.couponId, order.id)

  // Decrement tracked inventory — serialized + oversell-aware (see helper).
  const items = await db.select().from(schema.shopOrderItem).where(eq(schema.shopOrderItem.orderId, order.id))
  const oversold = await applyInventoryForPaidOrder(order.organizationId, items)

  // Tell the clinic a real order just came in — best-effort, never blocks the
  // finalize. (a) in-app notification to owners/admins; (b) an email to the
  // clinic's own contact address (same pattern as the contact-form lead email).
  const orderTotalCents = session.amount_total ?? order.totalCents
  const itemCount = items.reduce((n, it) => n + (it.quantity ?? 0), 0)
  // Surface an oversell to staff right in the "you got paid" alert — the money
  // is already captured, so they need to know to backorder or refund.
  const oversoldNote =
    oversold.length > 0
      ? ` ⚠️ Heads up — ${oversold
          .map((o) => `${o.ordered}× ${o.name} ordered but only ${o.had} were in stock`)
          .join('; ')}. You may need to backorder or refund.`
      : ''
  await notifyOrderReceived({
    organizationId: order.organizationId,
    excludeEmail: order.email ?? null,
    title: `Paid order — ${itemCount} ${itemCount === 1 ? 'item' : 'items'}, ${dollarsFromCents(orderTotalCents)}`,
    body: `${order.name || order.email} just paid for ${items.map((it) => `${it.quantity}× ${it.productName}`).join(', ') || 'an order'}.${oversoldNote}`,
    linkPath: '/shop/orders',
  })

  return { ...order, status: 'paid', patientId }
}

/**
 * Decrement tracked inventory for a paid order's items. A `FOR UPDATE` row lock
 * serializes concurrent finalizes of DIFFERENT orders for the same variant, so
 * the second one sees the first's committed decrement and can DETECT an oversell
 * (the old `greatest(qty - n, 0)` silently floored it, hiding that the clinic
 * sold more than it had). Oversold variants are clamped to 0 + returned so the
 * caller can alert staff. Untracked variants (inventoryQty null) are unlimited.
 */
export async function applyInventoryForPaidOrder(
  organizationId: string,
  items: Array<{ variantId: string | null; quantity: number | null; productName: string }>,
): Promise<Array<{ name: string; ordered: number; had: number }>> {
  const oversold: Array<{ name: string; ordered: number; had: number }> = []
  await db.transaction(async (tx) => {
    for (const it of items) {
      if (!it.variantId) continue
      const [v] = await tx
        .select({ qty: schema.shopProductVariant.inventoryQty })
        .from(schema.shopProductVariant)
        .where(
          and(
            eq(schema.shopProductVariant.organizationId, organizationId),
            eq(schema.shopProductVariant.id, it.variantId),
          ),
        )
        .for('update')
        .limit(1)
      if (!v || v.qty == null) continue // untracked → unlimited
      const ordered = it.quantity ?? 0
      if (v.qty < ordered) {
        oversold.push({ name: it.productName, ordered, had: v.qty })
        await tx
          .update(schema.shopProductVariant)
          .set({ inventoryQty: 0 })
          .where(eq(schema.shopProductVariant.id, it.variantId))
      } else {
        await tx
          .update(schema.shopProductVariant)
          .set({ inventoryQty: v.qty - ordered })
          .where(eq(schema.shopProductVariant.id, it.variantId))
      }
    }
  })
  return oversold
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
  /** The buyer's email — they never get the staff alert about their own order. */
  excludeEmail?: string | null
}): Promise<void> {
  try {
    await notifyOrgMembers(
      input.organizationId,
      // 'comments' = clinic "Patient activity" bucket (default ON), the right
      // home for "a patient just paid you" — not 'offers' (billing/platform, OFF).
      { bucket: 'comments', type: 'shop_order_paid', title: input.title, body: input.body, linkPath: input.linkPath },
      { roles: ['owner', 'admin'], excludeEmail: input.excludeEmail ?? null },
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
