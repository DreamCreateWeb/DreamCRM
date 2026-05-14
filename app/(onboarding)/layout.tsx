import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/signin')

  const orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
  if (orgId) {
    const [profile] = await db.select().from(clinicProfile).where(eq(clinicProfile.organizationId, orgId)).limit(1)
    // Already paying = already onboarded. Skip the wizard.
    if (profile?.subscriptionStatus && ['active', 'trialing'].includes(profile.subscriptionStatus)) {
      redirect('/dashboard')
    }
  }

  return <>{children}</>
}
