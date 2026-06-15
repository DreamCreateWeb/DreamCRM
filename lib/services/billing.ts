import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
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
    success_url: publicUrl('/settings/plans?checkout=success'),
    cancel_url: publicUrl('/settings/plans?checkout=cancelled'),
    allow_promotion_codes: true,
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
    return res.data.map((inv) => ({
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
    const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price'] })
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
    return {
      status: sub.status ?? null,
      interval,
      currentPeriodEnd: periodEndRaw ? new Date(periodEndRaw * 1000) : null,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    }
  } catch (err) {
    console.warn('[billing] getOrgSubscriptionSummary failed', err)
    return null
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
    sub.items.data.find((it) => getPlanByPriceId(it.price?.id ?? '')) ?? sub.items.data[0]
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
  const hasAddonItem = sub.items.data.some((it) => isSocialAddonPriceId(it.price?.id))
  const socialAddonActive = subLive && hasAddonItem

  // Only stamp socialAddonSince when flipping ON from OFF; otherwise leave it.
  const [prev] = await db
    .select({ socialAddon: schema.clinicProfile.socialAddon })
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
