import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { PLANS, getPlanByPriceId, type BillingInterval, type PlanId } from '@/lib/stripe-config'

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

  const item = sub.items.data[0]
  const priceId = item?.price?.id
  const planMatch = priceId ? getPlanByPriceId(priceId) : undefined
  const planTier = resolvePlanTier(sub.status, planMatch)

  await db
    .update(schema.clinicProfile)
    .set({
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      planTier,
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
      updatedAt: new Date(),
    })
    .where(eq(schema.clinicProfile.organizationId, profile.organizationId))
}
