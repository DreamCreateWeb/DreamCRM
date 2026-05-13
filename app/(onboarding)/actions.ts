'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import { eq } from 'drizzle-orm'

/**
 * Marks onboarding as complete by creating (or upserting) the clinic_profile
 * row for the user's active organization. Called from onboarding-04 when the
 * user clicks "Go To Dashboard".
 *
 * For now this just creates a minimal row; clinic detail fields are filled in
 * later from the clinic settings UI. The presence of a clinic_profile row
 * signals that onboarding is complete.
 */
export async function completeOnboarding(formData?: FormData) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect('/signin')
  }

  const orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
  if (!orgId) {
    // Shouldn't happen — sign-up creates an org. But if it does, send back.
    redirect('/signup')
  }

  // Pull org name so we can default the clinic display name
  const [org] = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1)

  await db
    .insert(clinicProfile)
    .values({
      organizationId: orgId,
      legalName: org?.name ?? null,
      displayName: org?.name ?? null,
      planTier: 'basic',
    })
    .onConflictDoNothing({ target: clinicProfile.organizationId })

  // Optional fields from onboarding form (later steps can pass more)
  const clinicType = formData?.get('clinicType')?.toString()
  if (clinicType) {
    await db
      .update(clinicProfile)
      .set({ template: clinicType })
      .where(eq(clinicProfile.organizationId, orgId))
  }

  redirect('/dashboard')
}
