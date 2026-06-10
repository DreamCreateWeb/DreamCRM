'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth/server'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { seedDefaultIntakeForm } from '@/lib/services/forms'
import { PLANS, type BillingInterval } from '@/lib/stripe-config'
import { RESERVED_SLUGS, SLUG_PATTERN } from '@/lib/onboarding/slug'
import { slugify } from '@/lib/utils'

const Step1 = z.object({
  practiceName: z.string().trim().min(1, 'Tell us your practice name').max(200),
  phone: z.string().trim().max(40).optional(),
})
const Step2 = z.object({
  street: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().min(1).max(20),
  country: z.string().trim().min(1).max(100),
})

const Step3 = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'At least 3 characters')
    .max(40)
    .regex(SLUG_PATTERN, 'Lowercase letters, numbers, and hyphens only'),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a valid color').optional(),
})

// Steps 1-3 just validate input and route forward; the form components persist
// drafts to sessionStorage via lib/onboarding/storage.ts. The real DB writes
// happen in submitOnboarding when the user picks a plan in step 4.
export async function saveOnboardingStep1(input: z.infer<typeof Step1>) {
  Step1.parse(input)
  redirect('/onboarding-02')
}
export async function saveOnboardingStep2(input: z.infer<typeof Step2>) {
  Step2.parse(input)
  redirect('/onboarding-03')
}
export async function saveOnboardingStep3(input: z.infer<typeof Step3>) {
  Step3.parse(input)
  redirect('/onboarding-04')
}

async function slugTaken(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.slug, slug))
    .limit(1)
  return Boolean(row)
}

export interface SlugCheckResult {
  available: boolean
  /** Why it isn't available (already shown politely in the UI). */
  reason?: 'invalid' | 'reserved' | 'taken'
  /** A free alternative worth offering when taken/reserved. */
  suggestion?: string
}

/**
 * Live availability check for the clinic's web address
 * ({slug}.dreamcreatestudio.com) — used by onboarding step 3.
 */
export async function checkClinicSlug(raw: string): Promise<SlugCheckResult> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Sign in to continue')

  const slug = raw.trim().toLowerCase()
  if (slug.length < 3 || !SLUG_PATTERN.test(slug)) {
    return { available: false, reason: 'invalid' }
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { available: false, reason: 'reserved', suggestion: await firstFreeSlug(`${slug}-dental`) }
  }
  if (await slugTaken(slug)) {
    return { available: false, reason: 'taken', suggestion: await firstFreeSlug(slug, { skipBase: true }) }
  }
  return { available: true }
}

/** First free variant of a base slug: base, base-dental, base-2 … base-9. */
async function firstFreeSlug(base: string, opts: { skipBase?: boolean } = {}): Promise<string | undefined> {
  const candidates = [
    ...(opts.skipBase ? [] : [base]),
    `${base}-dental`,
    ...Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`),
  ]
  for (const c of candidates) {
    if (c.length < 3 || !SLUG_PATTERN.test(c) || RESERVED_SLUGS.has(c)) continue
    if (!(await slugTaken(c))) return c
  }
  return undefined
}

const SubmitInput = z.object({
  practiceName: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  street: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().max(100).optional(),
  slug: z.string().trim().toLowerCase().max(40).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  planId: z.enum(['basic', 'pro', 'premium']),
  interval: z.enum(['monthly', 'annual']),
})

/**
 * Final onboarding submit. Creates the clinic organization (or reuses the
 * caller's existing one), seeds clinic_profile from the wizard draft,
 * creates a Stripe customer + subscription Checkout session, returns the
 * URL. Checkout allows promotion codes, so clinics with a custom-pricing
 * code from us can apply it right there.
 *
 * Client should redirect to the returned URL. If Stripe isn't configured
 * for the chosen plan, returns { url: null } and the caller routes straight
 * to the dashboard (the clinic stays on basic until billing succeeds).
 */
export async function submitOnboarding(input: z.infer<typeof SubmitInput>): Promise<{ url: string | null }> {
  const data = SubmitInput.parse(input)
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/signin')

  // Platform admins operate the platform org; running clinic onboarding as one
  // would create a clinic_profile + Stripe subscription ON the platform org
  // (its activeOrganizationId is the platform org). Block it outright.
  if ((session.user as { platformAdmin?: boolean }).platformAdmin) {
    throw new Error('Platform admins cannot go through clinic onboarding.')
  }

  // Resolve (or create) the user's clinic org.
  let orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
  if (!orgId) {
    const [existing] = await db
      .select()
      .from(schema.member)
      .where(eq(schema.member.userId, session.user.id))
      .limit(1)
    orgId = existing?.organizationId ?? null
  }

  if (!orgId) {
    const orgName = data.practiceName?.trim() || `${session.user.name || 'My'} Clinic`
    // Prefer the slug they picked in step 3 (validated + availability-checked
    // there); fall back to a name-derived slug. Either way, suffix on
    // collision — the picker check can race a concurrent signup.
    const requested = data.slug && SLUG_PATTERN.test(data.slug) && !RESERVED_SLUGS.has(data.slug) ? data.slug : null
    const baseSlug = requested || slugify(orgName) || 'clinic'
    let slug = baseSlug
    let attempt = 0
    while (await slugTaken(slug)) {
      attempt++
      slug = `${baseSlug}-${attempt}`
    }

    const newOrgId = crypto.randomUUID()
    await db.insert(schema.organization).values({
      id: newOrgId,
      name: orgName,
      slug,
      type: 'clinic',
    })
    await db.insert(schema.member).values({
      id: crypto.randomUUID(),
      organizationId: newOrgId,
      userId: session.user.id,
      role: 'owner',
    })
    await db
      .update(schema.session)
      .set({ activeOrganizationId: newOrgId })
      .where(eq(schema.session.id, session.session.id))
    orgId = newOrgId
  }

  const displayName = data.practiceName?.trim() || session.user.name || 'My Clinic'

  await db
    .insert(schema.clinicProfile)
    .values({
      organizationId: orgId,
      legalName: displayName,
      displayName,
      phone: data.phone?.trim() || null,
      addressLine1: data.street?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      country: data.country?.trim() || 'US',
      brandColor: data.brandColor || null,
      // Start on 'basic'. The paid tier is granted by the Stripe webhook only
      // AFTER payment confirms (syncSubscriptionFromStripe). Setting the selected
      // tier here meant an abandoned checkout — or a missing/misconfigured Stripe
      // price (the { url: null } path below) — left the clinic on a paid tier it
      // never paid for.
      planTier: 'basic',
    })
    .onConflictDoUpdate({
      target: schema.clinicProfile.organizationId,
      set: {
        legalName: displayName,
        displayName,
        ...(data.phone?.trim() ? { phone: data.phone.trim() } : {}),
        addressLine1: data.street?.trim() || null,
        city: data.city?.trim() || null,
        ...(data.state?.trim() ? { state: data.state.trim() } : {}),
        postalCode: data.postalCode?.trim() || null,
        country: data.country?.trim() || 'US',
        ...(data.brandColor ? { brandColor: data.brandColor } : {}),
        // Intentionally NOT touching planTier on conflict — the webhook owns it,
        // so re-running onboarding never downgrades a clinic that already paid.
        updatedAt: new Date(),
      },
    })

  // Every clinic starts with the standard new-patient intake form (idempotent
  // — re-running onboarding never duplicates it). Best-effort: a hiccup here
  // must never block checkout.
  try {
    await seedDefaultIntakeForm(orgId)
  } catch (err) {
    console.warn('[onboarding] could not seed default intake form', err)
  }

  const [profile] = await db
    .select()
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, orgId))
    .limit(1)

  let customerId = profile?.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      name: displayName,
      metadata: { organizationId: orgId },
    })
    customerId = customer.id
    await db
      .update(schema.clinicProfile)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(schema.clinicProfile.organizationId, orgId))
  }

  const plan = PLANS.find((p) => p.id === data.planId)
  const priceId = plan?.priceIds[data.interval as BillingInterval]
  if (!priceId) {
    return { url: null }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const checkout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // Lets clinics apply a promo / custom-pricing code we hand them.
    allow_promotion_codes: true,
    success_url: `${appUrl}/onboarding-complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/onboarding-04`,
    subscription_data: {
      metadata: { organizationId: orgId, planId: data.planId, interval: data.interval, userId: session.user.id },
    },
    metadata: { organizationId: orgId, planId: data.planId, interval: data.interval, userId: session.user.id },
  })

  return { url: checkout.url }
}
