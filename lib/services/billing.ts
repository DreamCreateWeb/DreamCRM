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

async function ensureStripeCustomer(userId: string, email: string, name: string | null) {
  const [profile] = await db
    .select()
    .from(schema.billingProfiles)
    .where(eq(schema.billingProfiles.userId, userId))
    .limit(1)

  if (profile?.stripeCustomerId) return profile.stripeCustomerId

  const customer = await stripe.customers.create({
    email,
    name: name ?? undefined,
    metadata: { userId },
  })

  await db
    .insert(schema.billingProfiles)
    .values({ userId, stripeCustomerId: customer.id, billingEmail: email })
    .onConflictDoUpdate({
      target: schema.billingProfiles.userId,
      set: { stripeCustomerId: customer.id, billingEmail: email, updatedAt: new Date() },
    })

  return customer.id
}

export async function createCheckoutSession(args: {
  userId: string
  email: string
  name: string | null
  planId: PlanId
  interval: BillingInterval
}) {
  const plan = PLANS.find((p) => p.id === args.planId)
  if (!plan) throw new Error('Unknown plan')
  const priceId = plan.priceIds[args.interval]
  if (!priceId) throw new Error(`Stripe price for ${plan.name} (${args.interval}) is not configured`)

  const customerId = await ensureStripeCustomer(args.userId, args.email, args.name)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: publicUrl('/settings/plans?checkout=success'),
    cancel_url: publicUrl('/settings/plans?checkout=cancelled'),
    allow_promotion_codes: true,
    metadata: { userId: args.userId, planId: plan.id, interval: args.interval },
    subscription_data: {
      metadata: { userId: args.userId, planId: plan.id, interval: args.interval },
    },
  })

  return session
}

export async function createPortalSession(args: { userId: string; email: string; name: string | null }) {
  const customerId = await ensureStripeCustomer(args.userId, args.email, args.name)
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: publicUrl('/settings/billing'),
  })
  return portal
}

export async function syncSubscriptionFromStripe(subscriptionId: string) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price', 'default_payment_method', 'customer'],
  })

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  if (!customerId) throw new Error('Subscription has no customer')

  // Resolve back to a userId via existing billing_profiles row, or via metadata.
  let userId = (sub.metadata?.userId as string | undefined) ?? null
  if (!userId) {
    const [existing] = await db
      .select({ userId: schema.billingProfiles.userId })
      .from(schema.billingProfiles)
      .where(eq(schema.billingProfiles.stripeCustomerId, customerId))
      .limit(1)
    userId = existing?.userId ?? null
  }
  if (!userId) {
    console.warn('[stripe] subscription has no resolvable userId', subscriptionId)
    return
  }

  const item = sub.items.data[0]
  const priceId = item?.price?.id
  const planMatch = priceId ? getPlanByPriceId(priceId) : undefined

  // Map Stripe status → our `billing_plan` enum. Treat anything non-active as free.
  const dbPlan: 'free' | 'pro' | 'team' | 'enterprise' = (() => {
    if (sub.status !== 'active' && sub.status !== 'trialing') return 'free'
    switch (planMatch?.plan.id) {
      case 'basic':
        return 'free'
      case 'pro':
        return 'pro'
      case 'premium':
        return 'team'
      default:
        return 'free'
    }
  })()

  const pm = sub.default_payment_method
  const card = typeof pm === 'object' && pm && 'card' in pm ? (pm as any).card : null

  const renewsAt = (sub as any).current_period_end
    ? new Date(((sub as any).current_period_end as number) * 1000)
    : null

  await db
    .insert(schema.billingProfiles)
    .values({
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId ?? null,
      stripeStatus: sub.status,
      plan: dbPlan,
      renewsAt,
      cardLast4: card?.last4 ?? null,
      cardBrand: card?.brand ?? null,
      cardExpMonth: card?.exp_month ?? null,
      cardExpYear: card?.exp_year ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.billingProfiles.userId,
      set: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId ?? null,
        stripeStatus: sub.status,
        plan: dbPlan,
        renewsAt,
        cardLast4: card?.last4 ?? null,
        cardBrand: card?.brand ?? null,
        cardExpMonth: card?.exp_month ?? null,
        cardExpYear: card?.exp_year ?? null,
        updatedAt: new Date(),
      },
    })
}

export async function clearSubscription(subscriptionId: string) {
  const [profile] = await db
    .select()
    .from(schema.billingProfiles)
    .where(eq(schema.billingProfiles.stripeSubscriptionId, subscriptionId))
    .limit(1)
  if (!profile) return
  await db
    .update(schema.billingProfiles)
    .set({
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeStatus: 'canceled',
      plan: 'free',
      renewsAt: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.billingProfiles.userId, profile.userId))
}
