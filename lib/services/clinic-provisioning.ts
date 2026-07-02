import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { sendInvitationEmail } from '@/lib/email'
import { seedDefaultIntakeForm } from '@/lib/services/forms'
import { seedClinicDay0Defaults } from '@/lib/onboarding/defaults'
import { applyStarterFloor } from '@/lib/services/starter-pack'
import { PLANS, type BillingInterval, type PlanId } from '@/lib/stripe-config'
import { RESERVED_SLUGS, SLUG_PATTERN, isValidClinicSlug } from '@/lib/onboarding/slug'
import { slugify } from '@/lib/utils'
import { hasPaidSubscription, trialEndDate } from '@/lib/trial'

/**
 * Platform-side ("managed") clinic provisioning: the platform admin creates
 * the clinic, reserves a plan — optionally at a custom price via a Stripe
 * coupon — and the clinic owner gets an invite. On accept they land in the
 * dashboard with a "finish billing setup" banner that opens a checkout with
 * the negotiated price pre-applied. 'comped' clinics get their tier with no
 * Stripe subscription at all.
 *
 * planTier stays webhook-owned for managed clinics (granted only after the
 * subscription activates) — exactly like self-serve onboarding.
 */

export type ManagedPricing =
  | { kind: 'standard' }
  | { kind: 'percent_off'; percentOff: number; durationMonths?: number /* undefined = forever */ }
  | { kind: 'amount_off'; amountOffCents: number; durationMonths?: number /* undefined = forever */ }
  | { kind: 'comped' }

export interface CreateManagedClinicInput {
  name: string
  slug?: string
  ownerEmail: string
  ownerName: string
  planId: PlanId
  interval: BillingInterval
  pricing: ManagedPricing
  note?: string
  inviterUserId: string
  inviterName: string
  /** Optional referral attribution: the partner who referred this clinic +
   *  an optional per-clinic % override (basis points). The term defaults to
   *  the partner's default when omitted. */
  referral?: { partnerId: string; percentBps?: number | null }
}

export interface CreateManagedClinicResult {
  organizationId: string
  slug: string
  invitationId: string
  couponId: string | null
}

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

async function slugTaken(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.slug, slug))
    .limit(1)
  return Boolean(row)
}

async function resolveFreeSlug(requested: string | undefined, name: string): Promise<string> {
  const base =
    requested && isValidClinicSlug(requested)
      ? requested
      : (() => {
          const derived = slugify(name) || 'clinic'
          return SLUG_PATTERN.test(derived) && !RESERVED_SLUGS.has(derived) ? derived : `clinic-${derived}`.slice(0, 40)
        })()
  let slug = base
  let attempt = 0
  while ((await slugTaken(slug)) || RESERVED_SLUGS.has(slug)) {
    attempt++
    slug = `${base}-${attempt}`
  }
  return slug
}

/** Create the Stripe coupon representing this clinic's negotiated price. */
async function createPricingCoupon(
  clinicName: string,
  organizationId: string,
  pricing: ManagedPricing,
): Promise<string | null> {
  if (pricing.kind !== 'percent_off' && pricing.kind !== 'amount_off') return null

  const duration =
    pricing.durationMonths == null
      ? { duration: 'forever' as const }
      : pricing.durationMonths <= 1
        ? { duration: 'once' as const }
        : { duration: 'repeating' as const, duration_in_months: pricing.durationMonths }

  const coupon = await stripe.coupons.create({
    name: `${clinicName} — custom pricing`.slice(0, 40),
    ...(pricing.kind === 'percent_off'
      ? { percent_off: pricing.percentOff }
      : { amount_off: pricing.amountOffCents, currency: 'usd' }),
    ...duration,
    metadata: { organizationId },
  })
  return coupon.id
}

export async function createManagedClinic(input: CreateManagedClinicInput): Promise<CreateManagedClinicResult> {
  const name = input.name.trim()
  if (!name) throw new Error('Clinic name is required')
  const ownerEmail = input.ownerEmail.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new Error('Enter a valid owner email')
  if (input.pricing.kind === 'percent_off' && (input.pricing.percentOff < 1 || input.pricing.percentOff > 100)) {
    throw new Error('Percent off must be between 1 and 100')
  }
  if (input.pricing.kind === 'amount_off' && input.pricing.amountOffCents < 50) {
    throw new Error('Amount off must be at least $0.50')
  }

  const slug = await resolveFreeSlug(input.slug?.trim().toLowerCase(), name)
  const organizationId = crypto.randomUUID()
  const comped = input.pricing.kind === 'comped'

  await db.insert(schema.organization).values({
    id: organizationId,
    name,
    slug,
    type: 'clinic',
  })

  const couponId = await createPricingCoupon(name, organizationId, input.pricing)

  await db.insert(schema.clinicProfile).values({
    organizationId,
    legalName: name,
    displayName: name,
    // Comped clinics get their tier immediately + NO trial (there's no webhook).
    // Managed clinics start the no-card 7-day trial (full Premium) so the owner
    // can use everything from the moment they accept the invite, then activate
    // their RESERVED plan within the 7 days — the pending plan + coupon stay set
    // for that activation checkout.
    planTier: comped ? input.planId : 'premium',
    billingMode: comped ? 'comped' : 'managed',
    subscriptionStatus: comped ? null : 'trialing',
    trialEndsAt: comped ? null : trialEndDate(),
    pendingPlanId: comped ? null : input.planId,
    pendingBillingInterval: comped ? null : input.interval,
    stripeCouponId: couponId,
    managedNote: input.note?.trim() || null,
  })

  // Referral attribution (optional): copy the partner's default rate/term and
  // stamp the term clock. Best-effort — a bad partner id must not block clinic
  // creation. The owner-invite + the clinic already exist regardless.
  if (input.referral?.partnerId) {
    try {
      const { assignClinicReferral } = await import('@/lib/services/referrals')
      await assignClinicReferral(organizationId, input.referral.partnerId, input.referral.percentBps ?? undefined)
    } catch (err) {
      console.warn('[provisioning] could not attribute referral partner', err)
    }
  }

  // Every clinic starts with the standard new-patient intake form. Best-effort
  // — provisioning must not fail because form seeding hiccuped.
  try {
    await seedDefaultIntakeForm(organizationId)
  } catch (err) {
    console.warn('[provisioning] could not seed default intake form', err)
  }

  // Day-0 operational defaults (standard office hours). A managed clinic's
  // public /book page is live the moment the org exists, so the same
  // "closed every day" trap applies as self-serve. Idempotent + best-effort.
  try {
    await seedClinicDay0Defaults(organizationId)
  } catch (err) {
    console.warn('[provisioning] could not seed day-0 defaults', err)
  }

  // Day-0 COMPLETE FLOOR: deterministic starter copy + 4 canonical core
  // services so a managed clinic's site reads as finished the moment the org
  // exists. The floor copy intentionally requires neither phone nor address,
  // so it applies cleanly even though managed provisioning has neither yet.
  // Idempotent (null-only fill) + best-effort.
  try {
    await applyStarterFloor(organizationId, { displayName: name })
  } catch (err) {
    console.warn('[provisioning] could not apply starter floor', err)
  }

  // Invitation row in the exact shape better-auth's acceptInvitation expects
  // (the same table the org plugin writes via the team-invite flow).
  const invitationId = crypto.randomUUID()
  await db.insert(schema.invitation).values({
    id: invitationId,
    organizationId,
    email: ownerEmail,
    role: 'owner',
    status: 'pending',
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    inviterId: input.inviterUserId,
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com'
  await sendInvitationEmail(ownerEmail, {
    inviterName: input.inviterName,
    orgName: name,
    role: 'owner',
    inviteUrl: `${appUrl}/accept-invite?token=${invitationId}`,
  })

  return { organizationId, slug, invitationId, couponId }
}

/** Re-send (and re-arm) the pending owner invite for a managed clinic. */
export async function resendClinicOwnerInvite(args: {
  organizationId: string
  inviterName: string
}): Promise<{ email: string }> {
  const [invite] = await db
    .select()
    .from(schema.invitation)
    .where(
      and(
        eq(schema.invitation.organizationId, args.organizationId),
        eq(schema.invitation.status, 'pending'),
      ),
    )
    .limit(1)
  if (!invite) throw new Error('No pending invitation for this clinic')

  await db
    .update(schema.invitation)
    .set({ expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
    .where(eq(schema.invitation.id, invite.id))

  const [org] = await db
    .select({ name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, args.organizationId))
    .limit(1)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com'
  await sendInvitationEmail(invite.email, {
    inviterName: args.inviterName,
    orgName: org?.name ?? 'your clinic',
    role: invite.role ?? 'owner',
    inviteUrl: `${appUrl}/accept-invite?token=${invite.id}`,
  })
  return { email: invite.email }
}

export interface ActivationDetails {
  planId: PlanId
  planName: string
  interval: BillingInterval
  /** Base plan price in dollars for the interval. */
  basePrice: number
  /** Human description of the discount, e.g. "30% off for 12 months". Null = standard price. */
  discountLabel: string | null
  /** First-period price after the discount, in dollars (display only). */
  discountedPrice: number | null
}

/** What the owner sees on /billing/activate. Null = nothing pending. */
export async function getActivationDetails(organizationId: string): Promise<ActivationDetails | null> {
  const [profile] = await db
    .select()
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  if (!profile || profile.billingMode !== 'managed' || !profile.pendingPlanId) return null
  // Only hide activation once they've actually PAID — the local no-card trial
  // sets subscriptionStatus='trialing', and they must still be able to activate
  // their reserved plan during it (and after it expires).
  if (hasPaidSubscription({ subscriptionStatus: profile.subscriptionStatus, stripeSubscriptionId: profile.stripeSubscriptionId }))
    return null

  const planId = profile.pendingPlanId as PlanId
  const interval = (profile.pendingBillingInterval as BillingInterval) || 'monthly'
  const plan = PLANS.find((p) => p.id === planId)
  if (!plan) return null
  const basePrice = interval === 'annual' ? plan.annualPrice : plan.price

  let discountLabel: string | null = null
  let discountedPrice: number | null = null
  if (profile.stripeCouponId) {
    try {
      const coupon = await stripe.coupons.retrieve(profile.stripeCouponId)
      const span =
        coupon.duration === 'forever'
          ? 'for as long as you subscribe'
          : coupon.duration === 'once'
            ? interval === 'annual'
              ? 'on your first year'
              : 'on your first month'
            : `for ${coupon.duration_in_months} months`
      if (coupon.percent_off) {
        discountLabel = `${coupon.percent_off}% off ${span}`
        discountedPrice = Math.round(basePrice * (1 - coupon.percent_off / 100) * 100) / 100
      } else if (coupon.amount_off) {
        discountLabel = `$${(coupon.amount_off / 100).toLocaleString('en-US')} off ${span}`
        discountedPrice = Math.max(0, Math.round((basePrice - coupon.amount_off / 100) * 100) / 100)
      }
    } catch {
      // Coupon deleted in Stripe — fall back to standard pricing display;
      // checkout below degrades the same way.
    }
  }

  return { planId, planName: plan.name, interval, basePrice, discountLabel, discountedPrice }
}

/**
 * Checkout for a managed clinic's reserved plan, with the negotiated coupon
 * pre-applied (no code typing). Returns the Stripe-hosted URL.
 */
export async function createActivationCheckout(args: {
  organizationId: string
  userId: string
  email: string
}): Promise<{ url: string | null }> {
  const [profile] = await db
    .select()
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, args.organizationId))
    .limit(1)
  if (!profile || profile.billingMode !== 'managed' || !profile.pendingPlanId) {
    return { url: null }
  }

  const planId = profile.pendingPlanId as PlanId
  const interval = (profile.pendingBillingInterval as BillingInterval) || 'monthly'
  const plan = PLANS.find((p) => p.id === planId)
  const priceId = plan?.priceIds[interval]
  if (!priceId) return { url: null }

  let customerId = profile.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: args.email,
      name: profile.displayName ?? undefined,
      metadata: { organizationId: args.organizationId },
    })
    customerId = customer.id
    await db
      .update(schema.clinicProfile)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(schema.clinicProfile.organizationId, args.organizationId))
  }

  // Verify the coupon still exists; a deleted coupon must not block activation.
  let coupon: string | null = profile.stripeCouponId
  if (coupon) {
    try {
      const c = await stripe.coupons.retrieve(coupon)
      if (!c.valid) coupon = null
    } catch {
      coupon = null
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com'
  const checkout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // The negotiated price rides a pre-applied coupon; otherwise let them
    // type a promo code like any self-serve checkout.
    ...(coupon ? { discounts: [{ coupon }] } : { allow_promotion_codes: true as const }),
    // Route the post-activation owner/admin into the AI website interview when
    // their site still needs personalization (the billing cohort's seam into
    // every-cohort routing); the route falls through to the dashboard otherwise.
    success_url: `${appUrl}/billing/activated`,
    cancel_url: `${appUrl}/billing/activate`,
    subscription_data: {
      metadata: { organizationId: args.organizationId, planId, interval, userId: args.userId },
    },
    metadata: { organizationId: args.organizationId, planId, interval, userId: args.userId },
  })
  return { url: checkout.url }
}
