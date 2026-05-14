'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import { stripe } from '@/lib/stripe'
import { PLANS, type PlanId } from '@/lib/stripe-config'

export interface OnboardingSubmission {
  situation?: string
  orgType?: string
  companyName?: string
  city?: string
  postalCode?: string
  street?: string
  country?: string
  planId: PlanId
}

/**
 * Finalises onboarding: writes everything the user entered into
 * clinic_profile, creates (or reuses) a Stripe customer, and starts a Stripe
 * checkout session for the selected plan. Returns the checkout URL — the
 * client redirects to it. If Stripe isn't configured for this plan the action
 * still saves the profile and returns null so the caller can fall back to
 * the dashboard.
 */
export async function submitOnboarding(data: OnboardingSubmission): Promise<{ url: string | null }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/signin')

  const orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
  if (!orgId) redirect('/signup')

  const [org] = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1)
  if (!org) redirect('/signup')

  const displayName = data.companyName?.trim() || org.name

  // Upsert clinic_profile with everything we have
  await db
    .insert(clinicProfile)
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
      target: clinicProfile.organizationId,
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

  // Pick up the stored customer ID if there is one
  const [profile] = await db.select().from(clinicProfile).where(eq(clinicProfile.organizationId, orgId)).limit(1)

  let customerId = profile?.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      name: displayName,
      metadata: { organizationId: orgId },
    })
    customerId = customer.id
    await db.update(clinicProfile).set({ stripeCustomerId: customerId }).where(eq(clinicProfile.organizationId, orgId))
  }

  const plan = PLANS.find((p) => p.id === data.planId)
  if (!plan?.priceId) {
    return { url: null }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const checkout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: plan.priceId, quantity: 1 }],
    customer: customerId,
    success_url: `${appUrl}/onboarding-complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/onboarding-04`,
    subscription_data: {
      metadata: { organizationId: orgId, planId: data.planId },
    },
    metadata: { organizationId: orgId, planId: data.planId },
  })

  return { url: checkout.url }
}
