import 'server-only'
import { eq, inArray } from 'drizzle-orm'
import { stripe, subscriptionPeriodEnd } from '@/lib/stripe'
import { db, schema } from '@/lib/db'

/**
 * Server-only Stripe management surface for platform admins. Every read
 * returns plain JSON-able shapes so client components can render directly.
 *
 * NEVER import this from a Client Component. Server actions are the bridge.
 */

export interface AdminSubscription {
  id: string
  status: string
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: number | null
  createdAt: number
  customerId: string
  customerEmail: string | null
  customerName: string | null
  clinicOrgId: string | null
  clinicName: string | null
  itemId: string | null
  priceId: string | null
  productId: string | null
  productName: string | null
  unitAmountCents: number | null
  currency: string | null
  interval: string | null
  trialEnd: number | null
}

export async function listAdminSubscriptions(opts: { status?: string; limit?: number } = {}): Promise<AdminSubscription[]> {
  const subs = await stripe.subscriptions.list({
    status: (opts.status as any) ?? 'all',
    limit: opts.limit ?? 100,
    // Stripe caps expand depth at 4 levels — `data.items.data.price.product`
    // would be 5. Fetch products separately below.
    expand: ['data.customer', 'data.items.data.price'],
  })

  const customerIds = subs.data
    .map((s) => (typeof s.customer === 'string' ? s.customer : s.customer?.id))
    .filter(Boolean) as string[]

  // Resolve clinics linked to these Stripe customers in one round-trip.
  const clinicRows = customerIds.length
    ? await db
        .select({
          customerId: schema.clinicProfile.stripeCustomerId,
          orgId: schema.clinicProfile.organizationId,
          displayName: schema.clinicProfile.displayName,
          orgName: schema.organization.name,
        })
        .from(schema.clinicProfile)
        .leftJoin(
          schema.organization,
          eq(schema.clinicProfile.organizationId, schema.organization.id)
        )
        .where(inArray(schema.clinicProfile.stripeCustomerId, customerIds))
    : []

  const clinicByCustomer = new Map(
    clinicRows
      .filter((c) => c.customerId)
      .map((c) => [c.customerId!, { orgId: c.orgId, name: c.displayName ?? c.orgName ?? null }])
  )

  // Collect distinct product IDs across the returned prices, then fetch
  // their names in parallel. Small N — typically ≤ the count of plans.
  const productIds = Array.from(
    new Set(
      subs.data
        .map((s: any) => {
          const p = s.items.data[0]?.price?.product
          return typeof p === 'string' ? p : p?.id
        })
        .filter(Boolean) as string[],
    ),
  )
  const productNameById = new Map<string, string>()
  await Promise.all(
    productIds.map(async (id) => {
      try {
        const p = await stripe.products.retrieve(id)
        if (!p.deleted) productNameById.set(p.id, p.name)
      } catch {
        // Deleted / inaccessible product — leave name unset
      }
    }),
  )

  return subs.data.map((s: any) => {
    const customer = typeof s.customer === 'object' && !s.customer.deleted ? s.customer : null
    const customerId = typeof s.customer === 'string' ? s.customer : s.customer?.id ?? ''
    const item = s.items.data[0]
    const price = item?.price
    const productId = typeof price?.product === 'string' ? price.product : price?.product?.id ?? null
    const linked = clinicByCustomer.get(customerId)
    return {
      id: s.id,
      status: s.status,
      cancelAtPeriodEnd: !!s.cancel_at_period_end,
      currentPeriodEnd: subscriptionPeriodEnd(s),
      createdAt: s.created,
      customerId,
      customerEmail: customer?.email ?? null,
      customerName: customer?.name ?? null,
      clinicOrgId: linked?.orgId ?? null,
      clinicName: linked?.name ?? null,
      itemId: item?.id ?? null,
      priceId: price?.id ?? null,
      productId,
      productName: productId ? productNameById.get(productId) ?? null : null,
      unitAmountCents: price?.unit_amount ?? null,
      currency: price?.currency ?? null,
      interval: price?.recurring?.interval ?? null,
      trialEnd: s.trial_end ?? null,
    }
  })
}

// ---------- Summary / Attention helpers ----------

export interface SubscriptionStats {
  total: number
  active: number
  trialing: number
  pastDue: number
  canceled: number
  scheduledCancel: number
  trialEndingSoon: number
  mrrCents: number
  planMix: Array<{ productName: string; count: number; mrrCents: number }>
}

export interface SubscriptionAttention {
  trialEndingSoon: AdminSubscription[]
  pastDue: AdminSubscription[]
  scheduledCancel: AdminSubscription[]
}

export function monthlyContributionCents(sub: Pick<AdminSubscription, 'unitAmountCents' | 'interval' | 'status'>): number {
  if (sub.status !== 'active' && sub.status !== 'trialing') return 0
  if (sub.unitAmountCents == null) return 0
  if (sub.interval === 'year') return Math.round(sub.unitAmountCents / 12)
  if (sub.interval === 'week') return sub.unitAmountCents * 4
  if (sub.interval === 'day') return sub.unitAmountCents * 30
  return sub.unitAmountCents
}

export function summarizeSubscriptions(
  subs: AdminSubscription[],
  opts: { now?: number; trialWindowDays?: number } = {},
): SubscriptionStats {
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000)
  const windowSec = (opts.trialWindowDays ?? 7) * 24 * 60 * 60
  const planMixMap = new Map<string, { productName: string; count: number; mrrCents: number }>()
  let active = 0
  let trialing = 0
  let pastDue = 0
  let canceled = 0
  let scheduledCancel = 0
  let trialEndingSoon = 0
  let mrr = 0
  for (const s of subs) {
    const contribution = monthlyContributionCents(s)
    mrr += contribution
    if (s.status === 'active') active++
    else if (s.status === 'trialing') trialing++
    else if (s.status === 'past_due' || s.status === 'unpaid') pastDue++
    else if (s.status === 'canceled' || s.status === 'incomplete_expired') canceled++
    if (s.cancelAtPeriodEnd && s.status !== 'canceled') scheduledCancel++
    if (s.status === 'trialing' && s.trialEnd && s.trialEnd - nowSec <= windowSec && s.trialEnd >= nowSec) {
      trialEndingSoon++
    }
    if (s.status === 'active' || s.status === 'trialing') {
      const key = s.productName ?? 'Unknown'
      const existing = planMixMap.get(key)
      if (existing) {
        existing.count += 1
        existing.mrrCents += contribution
      } else {
        planMixMap.set(key, { productName: key, count: 1, mrrCents: contribution })
      }
    }
  }
  const planMix = Array.from(planMixMap.values()).sort((a, b) => b.mrrCents - a.mrrCents)
  return {
    total: subs.length,
    active,
    trialing,
    pastDue,
    canceled,
    scheduledCancel,
    trialEndingSoon,
    mrrCents: mrr,
    planMix,
  }
}

export function pickAttentionSubscriptions(
  subs: AdminSubscription[],
  opts: { now?: number; trialWindowDays?: number } = {},
): SubscriptionAttention {
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000)
  const windowSec = (opts.trialWindowDays ?? 7) * 24 * 60 * 60
  const trialEndingSoon = subs
    .filter((s) => s.status === 'trialing' && s.trialEnd && s.trialEnd - nowSec <= windowSec && s.trialEnd >= nowSec)
    .sort((a, b) => (a.trialEnd ?? 0) - (b.trialEnd ?? 0))
  const pastDue = subs
    .filter((s) => s.status === 'past_due' || s.status === 'unpaid')
    .sort((a, b) => (a.currentPeriodEnd ?? 0) - (b.currentPeriodEnd ?? 0))
  const scheduledCancel = subs
    .filter((s) => s.cancelAtPeriodEnd && s.status !== 'canceled')
    .sort((a, b) => (a.currentPeriodEnd ?? 0) - (b.currentPeriodEnd ?? 0))
  return { trialEndingSoon, pastDue, scheduledCancel }
}

export interface AdminPrice {
  id: string
  unitAmountCents: number | null
  currency: string
  interval: string | null
  intervalCount: number
  active: boolean
  nickname: string | null
}

export interface AdminProduct {
  id: string
  name: string
  description: string | null
  active: boolean
  prices: AdminPrice[]
}

export async function listAdminProducts(): Promise<AdminProduct[]> {
  const products = await stripe.products.list({ limit: 100, active: true })
  const productIds = products.data.map((p) => p.id)
  if (!productIds.length) return []

  // Fetch prices for these products. Stripe doesn't support filtering prices
  // by multiple product IDs in one call, so loop. Small N.
  const productMap = new Map<string, AdminProduct>(
    products.data.map((p) => [
      p.id,
      { id: p.id, name: p.name, description: p.description, active: p.active, prices: [] },
    ])
  )
  for (const pid of productIds) {
    const prices = await stripe.prices.list({ product: pid, limit: 50, active: true })
    for (const pr of prices.data) {
      productMap.get(pid)?.prices.push({
        id: pr.id,
        unitAmountCents: pr.unit_amount ?? null,
        currency: pr.currency,
        interval: pr.recurring?.interval ?? null,
        intervalCount: pr.recurring?.interval_count ?? 1,
        active: pr.active,
        nickname: pr.nickname ?? null,
      })
    }
  }
  return Array.from(productMap.values()).sort((a, b) => a.name.localeCompare(b.name))
}

// ---------- Mutations ----------

export async function cancelSubscriptionNow(id: string) {
  return stripe.subscriptions.cancel(id)
}

export async function setSubscriptionCancelAtPeriodEnd(id: string, cancel: boolean) {
  return stripe.subscriptions.update(id, { cancel_at_period_end: cancel })
}

export async function changeSubscriptionPrice(
  subscriptionId: string,
  newPriceId: string,
  prorationBehavior: 'create_prorations' | 'none' | 'always_invoice' = 'create_prorations'
) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId)
  const itemId = sub.items.data[0]?.id
  if (!itemId) throw new Error('Subscription has no items to update')
  return stripe.subscriptions.update(subscriptionId, {
    items: [{ id: itemId, price: newPriceId }],
    proration_behavior: prorationBehavior,
  })
}

export async function createProductWithPrices(input: {
  name: string
  description?: string | null
  monthlyAmountCents?: number | null
  annualAmountCents?: number | null
  currency?: string
}) {
  const currency = (input.currency ?? 'usd').toLowerCase()
  const product = await stripe.products.create({
    name: input.name,
    description: input.description ?? undefined,
  })
  const prices: any[] = []
  if (input.monthlyAmountCents && input.monthlyAmountCents > 0) {
    prices.push(
      await stripe.prices.create({
        product: product.id,
        unit_amount: input.monthlyAmountCents,
        currency,
        recurring: { interval: 'month' },
        nickname: `${input.name} — Monthly`,
      })
    )
  }
  if (input.annualAmountCents && input.annualAmountCents > 0) {
    prices.push(
      await stripe.prices.create({
        product: product.id,
        unit_amount: input.annualAmountCents,
        currency,
        recurring: { interval: 'year' },
        nickname: `${input.name} — Annual`,
      })
    )
  }
  return { product, prices }
}

export async function archivePrice(priceId: string) {
  return stripe.prices.update(priceId, { active: false })
}

export async function unarchivePrice(priceId: string) {
  return stripe.prices.update(priceId, { active: true })
}

export async function archiveProduct(productId: string) {
  return stripe.products.update(productId, { active: false })
}
