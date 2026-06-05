'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth/server'
import { db, schema } from '@/lib/db'
import { stripe } from '@/lib/stripe'
import { PLANS, type BillingInterval } from '@/lib/stripe-config'
import { slugify } from '@/lib/utils'

const Step1 = z.object({ accountType: z.enum(['company', 'freelance', 'starting']) })
const Step2 = z.object({
  orgType: z.enum(['individual', 'organization']),
  enableFeature: z.boolean(),
})
const Step3 = z.object({
  companyName: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  streetAddress: z.string().min(1).max(200),
  country: z.string().min(1).max(100),
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

const SubmitInput = z.object({
  companyName: z.string().min(1).max(200).optional(),
  city: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  street: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  planId: z.enum(['basic', 'pro', 'premium']),
  interval: z.enum(['monthly', 'annual']),
})

/**
 * Final onboarding submit. Creates a clinic organization (or reuses the
 * caller's existing one), seeds clinic_profile from the form, creates a
 * Stripe customer + subscription Checkout session, returns the URL.
 *
 * Client should redirect to the returned URL. If Stripe isn't configured
 * for the chosen plan, returns { url: null } and the caller can route
 * straight to the dashboard.
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
    const orgName = data.companyName?.trim() || `${session.user.name || 'My'} Clinic`
    const baseSlug = slugify(orgName) || 'clinic'
    let slug = baseSlug
    let attempt = 0
    while (
      (await db.select().from(schema.organization).where(eq(schema.organization.slug, slug)).limit(1))[0]
    ) {
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

  const displayName = data.companyName?.trim() || session.user.name || 'My Clinic'

  await db
    .insert(schema.clinicProfile)
    .values({
      organizationId: orgId,
      legalName: displayName,
      displayName,
      addressLine1: data.street?.trim() || null,
      city: data.city?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      country: data.country?.trim() || 'US',
      planTier: data.planId,
    })
    .onConflictDoUpdate({
      target: schema.clinicProfile.organizationId,
      set: {
        legalName: displayName,
        displayName,
        addressLine1: data.street?.trim() || null,
        city: data.city?.trim() || null,
        postalCode: data.postalCode?.trim() || null,
        country: data.country?.trim() || 'US',
        planTier: data.planId,
        updatedAt: new Date(),
      },
    })

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
    success_url: `${appUrl}/onboarding-complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/onboarding-04`,
    subscription_data: {
      metadata: { organizationId: orgId, planId: data.planId, interval: data.interval, userId: session.user.id },
    },
    metadata: { organizationId: orgId, planId: data.planId, interval: data.interval, userId: session.user.id },
  })

  return { url: checkout.url }
}

// Back-compat: old completeOnboarding (called from current onboarding-04 page)
// just routes to dashboard now; the real work moved to submitOnboarding,
// which is invoked from the new plan-picker on onboarding-04.
export async function completeOnboarding() {
  redirect('/')
}
