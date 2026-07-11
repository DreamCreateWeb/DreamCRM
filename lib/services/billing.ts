import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import type Stripe from 'stripe'
import {
  PLANS,
  getPlanByPriceId,
  isSocialAddonPriceId,
  type BillingInterval,
  type PlanId,
} from '@/lib/stripe-config'

function publicUrl(path: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.BETTER_AUTH_URL ? process.env.BETTER_AUTH_URL : 'http://localhost:3000')
  return `${base.replace(/\/$/, '')}${path}`
}

/**
 * Ensure a Stripe customer exists for this clinic org. The customer's
 * metadata is keyed on organizationId so we can resolve the customer
 * back to the clinic on webhook events.
 */
async function ensureOrgStripeCustomer(args: {
  organizationId: string
  email: string
  name: string
}): Promise<string> {
  const [profile] = await db
    .select({ stripeCustomerId: schema.clinicProfile.stripeCustomerId })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, args.organizationId))
    .limit(1)

  if (profile?.stripeCustomerId) return profile.stripeCustomerId

  const customer = await stripe.customers.create({
    email: args.email,
    name: args.name,
    metadata: { organizationId: args.organizationId },
  })

  await db
    .update(schema.clinicProfile)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(schema.clinicProfile.organizationId, args.organizationId))

  return customer.id
}

/**
 * Start a Stripe Checkout session for a clinic upgrading/changing plans.
 * Returns the session — caller should redirect to `session.url`.
 */
export async function createCheckoutSession(args: {
  organizationId: string
  email: string
  name: string
  planId: PlanId
  interval: BillingInterval
}) {
  const plan = PLANS.find((p) => p.id === args.planId)
  if (!plan) throw new Error(`Unknown plan: ${args.planId}`)
  const priceId = plan.priceIds[args.interval]
  if (!priceId) throw new Error(`Stripe price for ${plan.name} (${args.interval}) is not configured`)

  const customerId = await ensureOrgStripeCustomer({
    organizationId: args.organizationId,
    email: args.email,
    name: args.name,
  })

  return stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // Land back on billing with the session id so the page can SYNC the
    // subscription synchronously (activation must not hinge on webhook
    // timing) + show a success confirmation.
    success_url: publicUrl('/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}'),
    cancel_url: publicUrl('/settings/billing?checkout=cancelled'),
    allow_promotion_codes: true,
    // Stripe Tax: collect the billing address and let Stripe decide, state by
    // state, whether SaaS is taxable there (we only collect where the platform
    // holds a registration — managed in the Stripe dashboard). The saved
    // address keeps renewals + plan changes taxable too.
    automatic_tax: { enabled: true },
    billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' },
    tax_id_collection: { enabled: true },
    metadata: {
      organizationId: args.organizationId,
      planId: plan.id,
      interval: args.interval,
    },
    subscription_data: {
      metadata: {
        organizationId: args.organizationId,
        planId: plan.id,
        interval: args.interval,
      },
    },
  })
}

/**
 * Change the plan ON the clinic's EXISTING subscription — in place, with
 * proration — instead of creating a second one. Checkout `mode:'subscription'`
 * always mints a NEW subscription; for a clinic that already has one, that
 * meant two live subscriptions (the old one kept billing, orphaned when the
 * webhook overwrote `stripeSubscriptionId`). Returns true when the change was
 * handled here (caller must NOT open Checkout), false when there's no live
 * subscription to update (first purchase → Checkout is correct).
 */
export async function updateSubscriptionPlan(args: {
  organizationId: string
  planId: PlanId
  interval: BillingInterval
}): Promise<boolean> {
  const plan = PLANS.find((p) => p.id === args.planId)
  if (!plan) throw new Error(`Unknown plan: ${args.planId}`)
  const priceId = plan.priceIds[args.interval]
  if (!priceId) throw new Error(`Stripe price for ${plan.name} (${args.interval}) is not configured`)

  const [profile] = await db
    .select({
      stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId,
      socialAddon: schema.clinicProfile.socialAddon,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, args.organizationId))
    .limit(1)
  const subId = profile?.stripeSubscriptionId
  if (!subId) return false

  const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price'] })
  // Only update a subscription that's actually alive. Canceled/incomplete →
  // fall through to a fresh Checkout.
  if (!['active', 'trialing', 'past_due'].includes(sub.status)) return false

  const planItem = sub.items.data.find((it: Stripe.SubscriptionItem) => getPlanByPriceId(it.price?.id ?? ''))
  if (!planItem) return false

  if (planItem.price?.id !== priceId) {
    // Turn Stripe Tax on for the swapped subscription too — an older sub
    // (pre-tax rollout) may lack a customer address, which makes the update
    // reject; retry without so a plan change NEVER fails on tax plumbing
    // (the customer gets taxed from their next Checkout-borne address).
    const baseUpdate = {
      items: [{ id: planItem.id, price: priceId }],
      proration_behavior: 'create_prorations' as const,
      metadata: {
        organizationId: args.organizationId,
        planId: plan.id,
        interval: args.interval,
      },
    }
    try {
      await stripe.subscriptions.update(sub.id, { ...baseUpdate, automatic_tax: { enabled: true } })
    } catch (err) {
      console.warn('[billing] plan swap with automatic_tax failed; retrying without', err)
      await stripe.subscriptions.update(sub.id, baseUpdate)
    }
    // The social add-on item is priced per (tier, interval) — swap it to the
    // matching price so the add-on follows the plan change. Best-effort; the
    // webhook's sync keeps the flag correct regardless.
    if (profile?.socialAddon === 1) {
      try {
        const { reconcileSocialAddonItem } = await import('@/lib/services/social-billing')
        await reconcileSocialAddonItem(args.organizationId, true)
      } catch (err) {
        console.warn('[billing] add-on reprice after plan change failed', err)
      }
    }
  }

  // Write the new tier immediately — the UI the user lands on next must not
  // depend on webhook timing.
  await syncSubscriptionFromStripe(sub.id)
  return true
}

/**
 * Synchronously sync the subscription born from a completed Checkout session —
 * called from the success landing so activation doesn't hinge on webhook
 * timing. Verifies the session belongs to the org before syncing. Best-effort:
 * returns false on any mismatch/failure (the webhook remains the safety net).
 */
export async function syncCheckoutSuccess(
  organizationId: string,
  sessionId: string,
): Promise<boolean> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.metadata?.organizationId !== organizationId) return false
    const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
    if (!subId) return false
    await syncSubscriptionFromStripe(subId)
    return true
  } catch (err) {
    console.warn('[billing] checkout success sync failed', err)
    return false
  }
}

export interface OrgStripeInvoice {
  id: string
  number: string | null
  amountPaidCents: number
  currency: string
  status: string | null
  createdAt: Date
  hostedInvoiceUrl: string | null
  pdfUrl: string | null
}

/**
 * List this clinic org's own Stripe invoices, scoped to its Stripe customer.
 * Replaces the old cross-tenant `invoices` table read on Settings → Billing
 * (which had NO organization filter — a tenant could see every clinic's rows).
 *
 * Returns [] when the org has no Stripe customer yet, or if the Stripe call
 * fails — the billing page degrades to "no invoices yet · manage in Stripe"
 * rather than erroring. Full invoice history + downloads always live in the
 * Stripe Customer Portal, which the page links to.
 */
export async function listOrgStripeInvoices(
  organizationId: string,
  limit = 12,
): Promise<OrgStripeInvoice[]> {
  const [profile] = await db
    .select({ stripeCustomerId: schema.clinicProfile.stripeCustomerId })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const customerId = profile?.stripeCustomerId
  if (!customerId) return []

  try {
    const res = await stripe.invoices.list({ customer: customerId, limit })
    return res.data.map((inv: Stripe.Invoice) => ({
      id: inv.id ?? '',
      number: inv.number ?? null,
      amountPaidCents: inv.amount_paid ?? 0,
      currency: (inv.currency ?? 'usd').toUpperCase(),
      status: inv.status ?? null,
      createdAt: new Date((inv.created ?? 0) * 1000),
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      pdfUrl: inv.invoice_pdf ?? null,
    }))
  } catch (err) {
    console.warn('[billing] listOrgStripeInvoices failed', err)
    return []
  }
}

export interface OrgSubscriptionSummary {
  status: string | null
  interval: BillingInterval | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  /** The default card on file (brand + last 4 + expiry), when one is set. */
  card: { brand: string; last4: string; expMonth: number; expYear: number } | null
  /** The TRUE next-charge amount from Stripe's upcoming invoice (accounts for
   *  coupons / add-ons / proration). Null when none / canceling / unavailable. */
  nextChargeCents: number | null
  nextChargeCurrency: string | null
}

/** Pull the default card off an expanded subscription (its own default PM, else
 *  the customer's invoice-settings default). Defensive — Stripe's expanded
 *  shapes vary, so everything is optional. */
function extractCardFromSub(sub: unknown): OrgSubscriptionSummary['card'] {
  const s = sub as {
    default_payment_method?: unknown
    customer?: { invoice_settings?: { default_payment_method?: unknown } }
  }
  const candidate =
    s.default_payment_method && typeof s.default_payment_method === 'object'
      ? s.default_payment_method
      : s.customer?.invoice_settings?.default_payment_method
  const card = (candidate as { card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number } } | null)?.card
  if (!card?.last4) return null
  return {
    brand: card.brand ?? 'card',
    last4: card.last4,
    expMonth: card.exp_month ?? 0,
    expYear: card.exp_year ?? 0,
  }
}

/**
 * Cheap read of the clinic's live subscription headline for Settings → Billing:
 * status, billing interval (from the price recurrence), the next renewal date,
 * and whether it's set to cancel at period end. Returns null when there's no
 * subscription on file or the Stripe call fails (page falls back to plan-only).
 */
export async function getOrgSubscriptionSummary(
  organizationId: string,
): Promise<OrgSubscriptionSummary | null> {
  const [profile] = await db
    .select({ stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const subId = profile?.stripeSubscriptionId
  if (!subId) return null

  try {
    const sub = await stripe.subscriptions.retrieve(subId, {
      expand: [
        'items.data.price',
        'default_payment_method',
        'customer.invoice_settings.default_payment_method',
      ],
    })
    const price = sub.items?.data?.[0]?.price
    const recurring = price?.recurring?.interval
    const interval: BillingInterval | null =
      recurring === 'year' ? 'annual' : recurring === 'month' ? 'monthly' : null
    // Stripe SDK shapes the period end on the subscription item in newer API
    // versions; read both spots defensively so we don't depend on one shape.
    const periodEndRaw =
      (sub as { current_period_end?: number | null }).current_period_end ??
      (sub.items?.data?.[0] as { current_period_end?: number | null } | undefined)?.current_period_end ??
      null

    // The TRUE next charge (coupon/add-on/proration-accurate) comes from the
    // upcoming invoice. Defensive: the method name + availability vary by API
    // version, and there's no upcoming invoice when canceling — degrade to
    // null (the UI then shows the renewal DATE only, never a wrong amount).
    let nextChargeCents: number | null = null
    let nextChargeCurrency: string | null = null
    const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer as { id?: string })?.id
    if (!sub.cancel_at_period_end && customerId) {
      try {
        // `retrieveUpcoming` was removed from the Stripe SDK (v18+) — the old
        // call threw into this catch on every load, so "Next charge" silently
        // never rendered. `createPreview` is its replacement.
        const upcoming = await stripe.invoices.createPreview({
          customer: customerId,
          subscription: subId,
        })
        if (typeof upcoming?.amount_due === 'number') {
          nextChargeCents = upcoming.amount_due
          nextChargeCurrency = upcoming.currency ?? null
        }
      } catch {
        /* no upcoming invoice available — leave null */
      }
    }

    return {
      status: sub.status ?? null,
      interval,
      currentPeriodEnd: periodEndRaw ? new Date(periodEndRaw * 1000) : null,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      card: extractCardFromSub(sub),
      nextChargeCents,
      nextChargeCurrency,
    }
  } catch (err) {
    console.warn('[billing] getOrgSubscriptionSummary failed', err)
    return null
  }
}

/**
 * Flip a clinic's subscription to cancel-at-period-end (or back). Keeps full
 * access until the period end either way; reversible right up to that moment.
 * Org-scoped. Returns the `{ ok | error }` convention for the settings action.
 */
export async function setSubscriptionCancelation(
  organizationId: string,
  cancelAtPeriodEnd: boolean,
): Promise<{ ok: true; cancelAtPeriodEnd: boolean } | { ok: false; error: string }> {
  const [profile] = await db
    .select({ stripeSubscriptionId: schema.clinicProfile.stripeSubscriptionId })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const subId = profile?.stripeSubscriptionId
  if (!subId) return { ok: false, error: 'No active subscription to change.' }
  try {
    await stripe.subscriptions.update(subId, { cancel_at_period_end: cancelAtPeriodEnd })
    return { ok: true, cancelAtPeriodEnd }
  } catch (err) {
    console.warn('[billing] setSubscriptionCancelation failed', err)
    return { ok: false, error: "We couldn't update your subscription right now. Try the Stripe portal." }
  }
}

export async function createPortalSession(args: {
  organizationId: string
  email: string
  name: string
}) {
  const customerId = await ensureOrgStripeCustomer({
    organizationId: args.organizationId,
    email: args.email,
    name: args.name,
  })
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: publicUrl('/settings/billing'),
  })
}

/**
 * Map a Stripe price → our clinic_profile.plan_tier value.
 * Falls back to 'basic' if the subscription is canceled / not on a known price.
 */
function resolvePlanTier(
  status: string,
  planMatch: ReturnType<typeof getPlanByPriceId>,
): 'basic' | 'pro' | 'premium' {
  if (status !== 'active' && status !== 'trialing') return 'basic'
  return (planMatch?.plan.id as 'basic' | 'pro' | 'premium' | undefined) ?? 'basic'
}

/**
 * Sync subscription state from Stripe → clinic_profile.
 * Called from the Stripe webhook on every relevant event.
 */
export async function syncSubscriptionFromStripe(subscriptionId: string) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price', 'customer'],
  })

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  if (!customerId) throw new Error('Subscription has no customer')

  // Resolve org: prefer subscription metadata, fall back to clinic_profile
  // matched by stripeCustomerId, finally fall back to the customer metadata.
  let organizationId = (sub.metadata?.organizationId as string | undefined) ?? null

  if (!organizationId) {
    const [existing] = await db
      .select({ organizationId: schema.clinicProfile.organizationId })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.stripeCustomerId, customerId))
      .limit(1)
    organizationId = existing?.organizationId ?? null
  }

  if (!organizationId && typeof sub.customer !== 'string' && sub.customer) {
    organizationId = ((sub.customer as { metadata?: { organizationId?: string } }).metadata
      ?.organizationId) ?? null
  }

  if (!organizationId) {
    console.warn('[stripe] subscription has no resolvable organizationId', subscriptionId)
    return
  }

  // Resolve the PLAN tier from the first NON-add-on item. The add-on is a
  // separate subscription item (its price isn't a plan price), so scanning for
  // the plan price among all items keeps the tier correct even when the add-on
  // sits at items.data[0].
  const planItem =
    sub.items.data.find((it: Stripe.SubscriptionItem) => getPlanByPriceId(it.price?.id ?? '')) ?? sub.items.data[0]
  const priceId = planItem?.price?.id
  const planMatch = priceId ? getPlanByPriceId(priceId) : undefined
  const planTier = resolvePlanTier(sub.status, planMatch)

  // Social add-on (Zernio social module): the flag is ON when any subscription
  // item is one of the add-on prices AND the subscription is live. Detecting it
  // here means the webhook keeps `social_addon` in sync on every event — buy,
  // cancel, AND plan change — idempotently (writing the same value on retries).
  // When the subscription isn't active/trialing we treat the add-on as off
  // (a canceled/unpaid sub grants nothing).
  const subLive = sub.status === 'active' || sub.status === 'trialing'
  const hasAddonItem = sub.items.data.some((it: Stripe.SubscriptionItem) => isSocialAddonPriceId(it.price?.id))
  const socialAddonActive = subLive && hasAddonItem

  // Only stamp socialAddonSince when flipping ON from OFF; otherwise leave it.
  const [prev] = await db
    .select({
      socialAddon: schema.clinicProfile.socialAddon,
      planTier: schema.clinicProfile.planTier,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const wasOn = prev?.socialAddon === 1
  const sinceSet = socialAddonActive
    ? wasOn
      ? {} // already on — keep the original since timestamp
      : { socialAddonSince: new Date() }
    : { socialAddonSince: null }

  await db
    .update(schema.clinicProfile)
    .set({
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      planTier,
      socialAddon: socialAddonActive ? 1 : 0,
      ...sinceSet,
      // Managed-clinic provisioning: once the reserved subscription is live,
      // the "finish billing setup" state is over.
      ...(sub.status === 'active' || sub.status === 'trialing'
        ? { pendingPlanId: null, pendingBillingInterval: null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.clinicProfile.organizationId, organizationId))

  // Entitlement may have SHRUNK (add-on dropped / tier downgraded) — actually
  // disconnect over-cap social channels; each Zernio connection is billable to
  // us. Best-effort: cap enforcement must never fail the webhook.
  const entitlementShrank =
    (wasOn && !socialAddonActive) || (prev?.planTier != null && prev.planTier !== planTier)
  if (entitlementShrank) {
    try {
      const { enforceSocialConnectionCap } = await import('@/lib/services/social-billing')
      await enforceSocialConnectionCap(organizationId)
    } catch (err) {
      console.warn('[stripe] over-cap social enforcement failed', err)
    }
  }
}

/**
 * Clear a clinic's subscription state when Stripe reports it's been deleted.
 * Drops plan tier back to 'basic' so module gating revokes paid features.
 */
export async function clearSubscription(subscriptionId: string) {
  const [profile] = await db
    .select({ organizationId: schema.clinicProfile.organizationId })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.stripeSubscriptionId, subscriptionId))
    .limit(1)
  if (!profile) return

  await db
    .update(schema.clinicProfile)
    .set({
      stripeSubscriptionId: null,
      subscriptionStatus: 'canceled',
      planTier: 'basic',
      // A canceled subscription grants nothing — drop the social add-on too.
      socialAddon: 0,
      socialAddonSince: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.clinicProfile.organizationId, profile.organizationId))
}

/**
 * Idempotency claim for the platform Stripe webhook. Atomically records the
 * Stripe event id; returns true when WE claimed it (first time → process it),
 * false when it was already there (a retry/duplicate → skip). Paired with
 * `releaseStripeEvent` so a failed handler frees the claim for Stripe's retry.
 */
export async function claimStripeEvent(eventId: string, eventType: string): Promise<boolean> {
  if (!eventId) return true // no id to dedupe on — never block processing
  const rows = await db
    .insert(schema.stripeWebhookEvent)
    .values({ eventId, eventType })
    .onConflictDoNothing({ target: schema.stripeWebhookEvent.eventId })
    .returning({ eventId: schema.stripeWebhookEvent.eventId })
  return rows.length > 0
}

/** Release a previously-claimed event so a retry re-processes it (used when the
 *  handler throws, before returning 500). */
export async function releaseStripeEvent(eventId: string): Promise<void> {
  if (!eventId) return
  await db.delete(schema.stripeWebhookEvent).where(eq(schema.stripeWebhookEvent.eventId, eventId))
}
