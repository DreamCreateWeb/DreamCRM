import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { siteNeedsPersonalization } from '@/lib/services/starter-pack'

export const metadata = { title: 'Billing Activated - DreamCRM' }

export const dynamic = 'force-dynamic'

/**
 * Post-billing-activation landing (the managed-clinic Stripe Checkout
 * `success_url`). A pure server redirect: a clinic owner/admin whose site still
 * needs personalization is sent into the `/welcome` AI interview (the same
 * cohort the self-serve `/onboarding-complete` step routes); everyone else lands
 * on the dashboard. This is the billing cohort's seam into the every-cohort
 * routing — see also accept-invite (post-accept) + onboarding-complete.
 */
export default async function BillingActivatedPage() {
  const ctx = await requireTenant()

  // Only a clinic owner/admin has a site to personalize. Anyone else → dashboard
  // (patients are bounced to their portal by the dashboard page itself).
  if (ctx.tenantType !== 'clinic' || (ctx.role !== 'owner' && ctx.role !== 'admin')) {
    redirect('/dashboard')
  }

  const [profile] = await db
    .select({
      tagline: clinicProfile.tagline,
      onboardingInterviewCompletedAt: clinicProfile.onboardingInterviewCompletedAt,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)

  const needs = siteNeedsPersonalization({
    tagline: profile?.tagline ?? null,
    onboardingInterviewCompletedAt: profile?.onboardingInterviewCompletedAt ?? null,
  })

  redirect(needs ? '/welcome' : '/dashboard')
}
