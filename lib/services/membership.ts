import 'server-only'
import { and, asc, count, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { slugify } from '@/lib/utils'
import type {
  PlanRow,
  PlanInput,
  MemberRow,
  Benefit,
  BillingInterval,
  PlanStatus,
  MembershipStatus,
} from '@/lib/types/membership'

/**
 * Membership plans — recurring cash-pay plans (the alternative to dental
 * insurance for the uninsured). Billed via a Stripe SUBSCRIPTION on the
 * clinic's connected account, so the clinic collects directly. Mirrors the
 * shop-checkout direct-charge pattern but in subscription mode.
 */

export type { PlanRow, PlanInput, MemberRow, Benefit } from '@/lib/types/membership'

export function newPlanId(): string {
  return `mplan_${randomBytes(10).toString('hex')}`
}
export function newMembershipId(): string {
  return `mem_${randomBytes(10).toString('hex')}`
}

// ── Plans (admin) ─────────────────────────────────────────────────────────

async function memberCounts(planIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (planIds.length === 0) return out
  const rows = await db
    .select({ planId: schema.membership.planId, c: count() })
    .from(schema.membership)
    .where(and(inArray(schema.membership.planId, planIds), eq(schema.membership.status, 'active')))
    .groupBy(schema.membership.planId)
  for (const r of rows) out.set(r.planId, Number(r.c))
  return out
}

function toPlanRow(p: typeof schema.membershipPlan.$inferSelect, memberCount: number): PlanRow {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    billingInterval: p.billingInterval as BillingInterval,
    priceCents: p.priceCents,
    benefits: p.benefits,
    discountPercent: p.discountPercent,
    status: p.status as PlanStatus,
    featured: p.featured === 1,
    position: p.position,
    memberCount,
  }
}

export async function listPlans(organizationId: string): Promise<PlanRow[]> {
  const plans = await db
    .select()
    .from(schema.membershipPlan)
    .where(eq(schema.membershipPlan.organizationId, organizationId))
    .orderBy(asc(schema.membershipPlan.position), desc(schema.membershipPlan.createdAt))
  const counts = await memberCounts(plans.map((p) => p.id))
  return plans.map((p) => toPlanRow(p, counts.get(p.id) ?? 0))
}

export async function getPlan(organizationId: string, id: string): Promise<PlanRow | null> {
  const [p] = await db
    .select()
    .from(schema.membershipPlan)
    .where(and(eq(schema.membershipPlan.organizationId, organizationId), eq(schema.membershipPlan.id, id)))
    .limit(1)
  if (!p) return null
  const counts = await memberCounts([p.id])
  return toPlanRow(p, counts.get(p.id) ?? 0)
}

export async function listActivePlans(organizationId: string): Promise<PlanRow[]> {
  return (await listPlans(organizationId)).filter((p) => p.status === 'active')
}

async function uniquePlanSlug(organizationId: string, name: string, excludeId?: string): Promise<string> {
  const base = slugify(name) || 'plan'
  const existing = await db
    .select({ slug: schema.membershipPlan.slug, id: schema.membershipPlan.id })
    .from(schema.membershipPlan)
    .where(eq(schema.membershipPlan.organizationId, organizationId))
  const taken = new Set(existing.filter((e) => e.id !== excludeId).map((e) => e.slug))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

/** Create/update a plan (DB only — the Stripe price is created lazily on the
 * first join, so we never call Stripe until an account is connected). A price
 * change clears the cached Stripe price (immutable in Stripe → recreate). */
export async function savePlan(organizationId: string, input: PlanInput): Promise<string> {
  const id = input.id ?? newPlanId()
  const slug = await uniquePlanSlug(organizationId, input.name, input.id)
  const benefits: Benefit[] = input.benefits.filter((b) => b.label.trim().length > 0)
  const priceCents = Math.round((Number(input.priceDollars) || 0) * 100)
  const base = {
    name: input.name.trim(),
    slug,
    description: input.description?.trim() || null,
    billingInterval: input.billingInterval,
    priceCents,
    benefits,
    discountPercent: Math.max(0, Math.min(input.discountPercent || 0, 100)),
    status: input.status,
    featured: input.featured ? 1 : 0,
    updatedAt: new Date(),
  }
  if (input.id) {
    const [existing] = await db
      .select({ priceCents: schema.membershipPlan.priceCents, billingInterval: schema.membershipPlan.billingInterval })
      .from(schema.membershipPlan)
      .where(eq(schema.membershipPlan.id, id))
      .limit(1)
    const priceChanged = existing && (existing.priceCents !== priceCents || existing.billingInterval !== input.billingInterval)
    await db
      .update(schema.membershipPlan)
      .set(priceChanged ? { ...base, stripePriceId: null } : base)
      .where(and(eq(schema.membershipPlan.organizationId, organizationId), eq(schema.membershipPlan.id, id)))
  } else {
    await db.insert(schema.membershipPlan).values({ id, organizationId, ...base })
  }
  return id
}

export async function setPlanStatus(organizationId: string, id: string, status: PlanStatus): Promise<void> {
  await db
    .update(schema.membershipPlan)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(schema.membershipPlan.organizationId, organizationId), eq(schema.membershipPlan.id, id)))
}

export async function deletePlan(organizationId: string, id: string): Promise<void> {
  // Block deletion when members are attached (FK is restrict) — archive instead.
  const [m] = await db.select({ id: schema.membership.id }).from(schema.membership).where(eq(schema.membership.planId, id)).limit(1)
  if (m) {
    await setPlanStatus(organizationId, id, 'archived')
    return
  }
  await db.delete(schema.membershipPlan).where(and(eq(schema.membershipPlan.organizationId, organizationId), eq(schema.membershipPlan.id, id)))
}

// ── Connected account + Stripe price ──────────────────────────────────────

async function connectedAccountId(organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({ accountId: schema.shopConfig.stripeAccountId, status: schema.shopConfig.stripeAccountStatus, charges: schema.shopConfig.chargesEnabled })
    .from(schema.shopConfig)
    .where(eq(schema.shopConfig.organizationId, organizationId))
    .limit(1)
  if (!row?.accountId || row.status !== 'active' || row.charges !== 1) return null
  return row.accountId
}

async function ensurePlanPrice(plan: typeof schema.membershipPlan.$inferSelect, accountId: string): Promise<string> {
  if (plan.stripePriceId) return plan.stripePriceId
  const productId =
    plan.stripeProductId ??
    (await stripe.products.create({ name: `${plan.name} (membership)` }, { stripeAccount: accountId })).id
  const price = await stripe.prices.create(
    {
      product: productId,
      unit_amount: plan.priceCents,
      currency: 'usd',
      recurring: { interval: plan.billingInterval === 'annual' ? 'year' : 'month' },
    },
    { stripeAccount: accountId },
  )
  await db
    .update(schema.membershipPlan)
    .set({ stripeProductId: productId, stripePriceId: price.id, updatedAt: new Date() })
    .where(eq(schema.membershipPlan.id, plan.id))
  return price.id
}

// ── Public join (subscription checkout) ────────────────────────────────────

export interface JoinInput {
  planSlug: string
  email: string
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
}

export async function createMembershipCheckout(
  organizationId: string,
  baseUrl: string,
  input: JoinInput,
): Promise<{ url: string }> {
  const accountId = await connectedAccountId(organizationId)
  if (!accountId) throw new Error('This practice isn’t set up to accept memberships yet.')
  if (!input.email) throw new Error('An email is required to join.')

  const [plan] = await db
    .select()
    .from(schema.membershipPlan)
    .where(
      and(
        eq(schema.membershipPlan.organizationId, organizationId),
        eq(schema.membershipPlan.slug, input.planSlug),
        eq(schema.membershipPlan.status, 'active'),
      ),
    )
    .limit(1)
  if (!plan) throw new Error('That plan isn’t available.')

  const priceId = await ensurePlanPrice(plan, accountId)

  // Match or create the patient (membership.patientId is required).
  let patientId: string
  const [match] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        or(eq(schema.patient.email, input.email), input.phone ? eq(schema.patient.phone, input.phone) : sql`false`)!,
      ),
    )
    .limit(1)
  if (match) {
    patientId = match.id
  } else {
    patientId = `pat_${randomBytes(10).toString('hex')}`
    const now = new Date()
    await db.insert(schema.patient).values({
      id: patientId,
      organizationId,
      firstName: input.firstName?.trim() || 'New',
      lastName: input.lastName?.trim() || 'Member',
      email: input.email,
      phone: input.phone ?? null,
      isActive: 1,
      source: 'membership',
      lifecycle: 'new',
      firstSeenAt: now,
      lastActivityAt: now,
    })
  }

  const membershipId = newMembershipId()
  await db.insert(schema.membership).values({
    id: membershipId,
    organizationId,
    planId: plan.id,
    patientId,
    status: 'pending',
  })

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: input.email,
      success_url: `${baseUrl}/membership/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/membership`,
      metadata: { membershipId, organizationId },
      subscription_data: { metadata: { membershipId, organizationId } },
    } as never,
    { stripeAccount: accountId },
  )
  if (!session.url) throw new Error('Stripe did not return a checkout URL.')
  return { url: session.url }
}

/** Idempotently activate a membership once its subscription checkout completes. */
export async function finalizeMembershipFromSession(organizationId: string, sessionId: string): Promise<{ active: boolean; planName: string } | null> {
  const accountId = await connectedAccountId(organizationId)
  if (!accountId) return null
  const session = await stripe.checkout.sessions.retrieve(sessionId, undefined, { stripeAccount: accountId })
  const membershipId = session.metadata?.membershipId
  if (!membershipId) return null

  const [m] = await db
    .select()
    .from(schema.membership)
    .where(and(eq(schema.membership.organizationId, organizationId), eq(schema.membership.id, membershipId)))
    .limit(1)
  if (!m) return null
  const [plan] = await db.select({ name: schema.membershipPlan.name }).from(schema.membershipPlan).where(eq(schema.membershipPlan.id, m.planId)).limit(1)
  const planName = plan?.name ?? 'Membership'
  if (m.status === 'active') return { active: true, planName }
  if (session.payment_status !== 'paid' && session.status !== 'complete') return { active: false, planName }

  const subId = typeof session.subscription === 'string' ? session.subscription : null
  let periodEnd: Date | null = null
  if (subId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId, undefined, { stripeAccount: accountId })
      const end = (sub as { current_period_end?: number }).current_period_end
      if (end) periodEnd = new Date(end * 1000)
    } catch {
      /* leave periodEnd null */
    }
  }
  const now = new Date()
  await db
    .update(schema.membership)
    .set({ status: 'active', stripeSubscriptionId: subId, startedAt: now, currentPeriodEnd: periodEnd, updatedAt: now })
    .where(eq(schema.membership.id, m.id))
  return { active: true, planName }
}

/** Subscription lifecycle from the Connect webhook (updated / deleted). */
export async function handleSubscriptionEvent(
  organizationId: string,
  subscriptionId: string,
  status: string,
  currentPeriodEnd: number | null,
): Promise<void> {
  const mapped: MembershipStatus =
    status === 'active' || status === 'trialing'
      ? 'active'
      : status === 'past_due' || status === 'unpaid'
        ? 'past_due'
        : status === 'canceled'
          ? 'cancelled'
          : 'pending'
  await db
    .update(schema.membership)
    .set({
      status: mapped,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : undefined,
      cancelledAt: mapped === 'cancelled' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.membership.organizationId, organizationId), eq(schema.membership.stripeSubscriptionId, subscriptionId)))
}

// ── Members (admin) ─────────────────────────────────────────────────────────

export async function listMembers(organizationId: string): Promise<MemberRow[]> {
  const rows = await db
    .select({
      m: schema.membership,
      planName: schema.membershipPlan.name,
      planBenefits: schema.membershipPlan.benefits,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      email: schema.patient.email,
    })
    .from(schema.membership)
    .innerJoin(schema.membershipPlan, eq(schema.membership.planId, schema.membershipPlan.id))
    .leftJoin(schema.patient, eq(schema.membership.patientId, schema.patient.id))
    .where(eq(schema.membership.organizationId, organizationId))
    .orderBy(desc(schema.membership.createdAt))
  return rows.map((r) => ({
    id: r.m.id,
    patientId: r.m.patientId,
    patientName: r.firstName ? `${r.firstName} ${r.lastName ?? ''}`.trim() : null,
    email: r.email,
    planId: r.m.planId,
    planName: r.planName,
    planBenefits: r.planBenefits,
    status: r.m.status as MembershipStatus,
    benefitsUsed: r.m.benefitsUsed,
    currentPeriodEnd: r.m.currentPeriodEnd,
    startedAt: r.m.startedAt,
  }))
}

export async function markBenefitUsed(organizationId: string, membershipId: string, benefitLabel: string): Promise<void> {
  const [m] = await db
    .select({ benefitsUsed: schema.membership.benefitsUsed })
    .from(schema.membership)
    .where(and(eq(schema.membership.organizationId, organizationId), eq(schema.membership.id, membershipId)))
    .limit(1)
  if (!m) return
  const used = { ...m.benefitsUsed }
  used[benefitLabel] = (used[benefitLabel] ?? 0) + 1
  await db
    .update(schema.membership)
    .set({ benefitsUsed: used, updatedAt: new Date() })
    .where(and(eq(schema.membership.organizationId, organizationId), eq(schema.membership.id, membershipId)))
}

export interface MembershipStats {
  activeMembers: number
  mrrCents: number
}

export async function getMembershipStats(organizationId: string): Promise<MembershipStats> {
  const rows = await db
    .select({ priceCents: schema.membershipPlan.priceCents, interval: schema.membershipPlan.billingInterval })
    .from(schema.membership)
    .innerJoin(schema.membershipPlan, eq(schema.membership.planId, schema.membershipPlan.id))
    .where(and(eq(schema.membership.organizationId, organizationId), eq(schema.membership.status, 'active')))
  let activeMembers = 0
  let mrrCents = 0
  for (const r of rows) {
    activeMembers++
    mrrCents += r.interval === 'annual' ? Math.round(r.priceCents / 12) : r.priceCents
  }
  return { activeMembers, mrrCents }
}
