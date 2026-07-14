import 'server-only'
import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import { stripe, subscriptionPeriodEnd } from '@/lib/stripe'
import { slugify } from '@/lib/utils'
import { notifyOrgMembers } from './notifications'
import { sendNotificationEmail } from '@/lib/email'
import { normalizePhone, samePhone } from '@/lib/contact-normalize'
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

/** How long a 'pending' membership (a checkout in flight) blocks a re-join.
 *  After this, an un-completed checkout is treated as abandoned so the patient
 *  can try again. Comfortably covers a Stripe Checkout session's life. */
const PENDING_REJOIN_WINDOW_MS = 60 * 60 * 1000

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
      .where(and(eq(schema.membershipPlan.organizationId, organizationId), eq(schema.membershipPlan.id, id)))
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

  // Match or create the patient (membership.patientId is required). Matched
  // with normalization so a case/format mismatch still links: email case-
  // insensitively in SQL, phone on digits via samePhone over a small set.
  let patientId: string
  const emailLower = input.email.trim().toLowerCase()
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
  let matchedId: string | null = emailMatch?.id ?? null
  if (!matchedId && normalizePhone(input.phone)) {
    const candidates = await db
      .select({ id: schema.patient.id, phone: schema.patient.phone })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, organizationId),
          sql`${schema.patient.phone} is not null`,
        ),
      )
    matchedId = candidates.find((c) => samePhone(c.phone, input.phone))?.id ?? null
  }
  if (matchedId) {
    patientId = matchedId
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

  // Block a duplicate subscription for the same plan. A patient who is already
  // a member (active / past_due) must not get a SECOND recurring subscription
  // from a re-join, and a checkout already in flight (a recent 'pending') blocks
  // a rapid double-submit. An OLD pending (an abandoned checkout) is ignored so
  // the patient can retry — otherwise an abandoned cart would lock them out.
  const existingMemberships = await db
    .select({ status: schema.membership.status, createdAt: schema.membership.createdAt })
    .from(schema.membership)
    .where(
      and(
        eq(schema.membership.organizationId, organizationId),
        eq(schema.membership.planId, plan.id),
        eq(schema.membership.patientId, patientId),
      ),
    )
  const nowMs = Date.now()
  const blocking = existingMemberships.find(
    (m) =>
      m.status === 'active' ||
      m.status === 'past_due' ||
      (m.status === 'pending' && nowMs - m.createdAt.getTime() < PENDING_REJOIN_WINDOW_MS),
  )
  if (blocking) {
    throw new Error(
      blocking.status === 'pending'
        ? 'You already have a join in progress — check your email for the checkout link, or try again shortly.'
        : 'You’re already a member of this plan.',
    )
  }

  const membershipId = newMembershipId()
  await db.insert(schema.membership).values({
    id: membershipId,
    organizationId,
    planId: plan.id,
    patientId,
    status: 'pending',
  })

  // 1% platform fee on recurring membership revenue — same rule as every
  // other Connect money path (shop_config.platform_fee_bps, percent form
  // because subscriptions take a percent, not an amount).
  const [feeRow] = await db
    .select({ platformFeeBps: schema.shopConfig.platformFeeBps })
    .from(schema.shopConfig)
    .where(eq(schema.shopConfig.organizationId, organizationId))
    .limit(1)
  const feePercent = (feeRow?.platformFeeBps ?? 0) / 100

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: input.email,
      success_url: `${baseUrl}/membership/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/membership`,
      metadata: { membershipId, organizationId },
      subscription_data: {
        metadata: { membershipId, organizationId },
        ...(feePercent > 0 ? { application_fee_percent: feePercent } : {}),
      },
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
      const end = subscriptionPeriodEnd(sub)
      if (end) periodEnd = new Date(end * 1000)
    } catch {
      /* leave periodEnd null */
    }
  }
  const now = new Date()
  // Compare-and-swap: only the caller that flips pending->active runs the write
  // (the success page AND the Connect webhook both finalize). Mirrors the
  // shop-order finalizer so future activation side-effects fire exactly once.
  const claimed = await db
    .update(schema.membership)
    .set({ status: 'active', stripeSubscriptionId: subId, startedAt: now, currentPeriodEnd: periodEnd, updatedAt: now })
    .where(and(eq(schema.membership.id, m.id), ne(schema.membership.status, 'active')))
    .returning({ id: schema.membership.id })

  // Only the race winner notifies the clinic (best-effort, never blocks).
  if (claimed.length > 0) {
    const [pat] = await db
      .select({ firstName: schema.patient.firstName, lastName: schema.patient.lastName, email: schema.patient.email })
      .from(schema.patient)
      .where(eq(schema.patient.id, m.patientId))
      .limit(1)
    const who = pat ? `${pat.firstName} ${pat.lastName}`.trim() : 'A patient'
    await notifyMembershipJoined({
      organizationId,
      title: `New member — ${planName}`,
      body: `${who} just joined ${planName}.`,
      linkPath: '/payments/memberships',
      excludeEmail: pat?.email ?? null,
    })
  }
  return { active: true, planName }
}

/**
 * Best-effort "new member" alert to the clinic — in-app to owners/admins + an
 * email to the clinic's own contact address. Swallows its own errors.
 */
async function notifyMembershipJoined(input: {
  organizationId: string
  title: string
  body: string
  linkPath: string
  /** The joining patient's email — they never get the staff alert about themselves. */
  excludeEmail?: string | null
}): Promise<void> {
  try {
    await notifyOrgMembers(
      input.organizationId,
      // 'comments' = clinic "Patient activity" bucket (default ON) — a patient
      // joining a plan is patient activity, not 'offers' (billing/platform, OFF).
      { bucket: 'comments', type: 'membership_joined', title: input.title, body: input.body, linkPath: input.linkPath },
      { roles: ['owner', 'admin'], excludeEmail: input.excludeEmail ?? null },
    )
  } catch (err) {
    console.warn('[membership] notifyOrgMembers failed', err)
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
    console.warn('[membership] clinic member email failed', err)
  }
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
  // Only stamp cancelledAt when actually transitioning to cancelled, and never
  // clear it on a non-cancel event. Stripe delivers events out of order and
  // retries them; the old `cancelledAt: mapped==='cancelled' ? now : null` wiped
  // the cancellation timestamp on every later update (e.g. a past_due->active
  // recovery), losing the record of when the membership was cancelled.
  const set: Partial<typeof schema.membership.$inferInsert> = {
    status: mapped,
    updatedAt: new Date(),
  }
  if (currentPeriodEnd) set.currentPeriodEnd = new Date(currentPeriodEnd * 1000)
  if (mapped === 'cancelled') set.cancelledAt = new Date()
  await db
    .update(schema.membership)
    .set(set)
    .where(and(eq(schema.membership.organizationId, organizationId), eq(schema.membership.stripeSubscriptionId, subscriptionId)))
}

// ── Stale pending sweep ─────────────────────────────────────────────────────

/**
 * Delete abandoned `pending` memberships older than `olderThanHours`.
 *
 * `createMembershipCheckout` writes a `membership(status='pending')` row BEFORE
 * redirecting to Stripe Checkout. If the patient abandons the checkout, that row
 * never advances (the finalizer only runs on a completed session) and lingers
 * forever — inflating member lists and the "pending" view. This sweep clears
 * them. Scope is deliberately narrow so it can never touch a real membership:
 *   - status = 'pending' (active / past_due / cancelled are terminal/live),
 *   - stripeSubscriptionId IS NULL (a pending row WITH a subscription is
 *     mid-activation — the finalizer is about to flip it; never delete it),
 *   - createdAt older than the cutoff (default 24h — generous vs Stripe's
 *     ~24h checkout-session expiry, so an in-progress checkout is safe).
 * The membership status enum has no terminal "abandoned" value, so we delete
 * rather than mark; the auto-created patient row (if any) is intentionally left
 * in place. Idempotent + cheap — safe to call on every members-page load AND
 * export for a future cron. Returns the number of rows removed.
 */
export async function cleanupStalePendingMemberships(
  organizationId: string,
  olderThanHours = 24,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000)
  const deleted = await db
    .delete(schema.membership)
    .where(
      and(
        eq(schema.membership.organizationId, organizationId),
        eq(schema.membership.status, 'pending'),
        sql`${schema.membership.stripeSubscriptionId} is null`,
        sql`${schema.membership.createdAt} < ${cutoff}`,
      ),
    )
    .returning({ id: schema.membership.id })
  return deleted.length
}

// ── Members (admin) ─────────────────────────────────────────────────────────

export async function listMembers(organizationId: string): Promise<MemberRow[]> {
  // Sweep abandoned-checkout pending rows before listing so they never show up
  // as phantom members. Best-effort — a sweep failure must not break the list.
  await cleanupStalePendingMemberships(organizationId).catch((err) => {
    console.warn('[membership] cleanupStalePendingMemberships failed', err)
  })
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
    .select({ benefitsUsed: schema.membership.benefitsUsed, benefits: schema.membershipPlan.benefits })
    .from(schema.membership)
    .innerJoin(schema.membershipPlan, eq(schema.membership.planId, schema.membershipPlan.id))
    .where(and(eq(schema.membership.organizationId, organizationId), eq(schema.membership.id, membershipId)))
    .limit(1)
  if (!m) return
  // Don't redeem past the plan's included allotment. A benefit with no `qty`
  // is unlimited; one with a `qty` caps redemptions per period.
  const benefit = m.benefits.find((b) => b.label === benefitLabel)
  const current = m.benefitsUsed[benefitLabel] ?? 0
  if (benefit?.qty != null && current >= benefit.qty) {
    throw new Error(`“${benefitLabel}” is already fully used this period (${benefit.qty} of ${benefit.qty}).`)
  }
  const used = { ...m.benefitsUsed }
  used[benefitLabel] = current + 1
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
