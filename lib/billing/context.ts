import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { organization, member } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'
import { stripe } from '@/lib/stripe'

export interface ClinicBillingContext {
  userId: string
  userEmail: string
  organizationId: string
  organizationName: string
  customerId: string
}

/**
 * Resolves the active clinic for the current session and returns a Stripe
 * customer ID — creating one in Stripe the first time it's needed. The
 * customer is then stored on clinic_profile so we never create duplicates.
 *
 * Returns null when the session is invalid or the active org isn't a clinic.
 */
export async function getClinicBillingContext(): Promise<ClinicBillingContext | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null

  let orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
  if (!orgId) {
    const [m] = await db.select().from(member).where(eq(member.userId, session.user.id)).limit(1)
    if (!m) return null
    orgId = m.organizationId
  }

  const [org] = await db.select().from(organization).where(eq(organization.id, orgId)).limit(1)
  if (!org || org.type !== 'clinic') return null

  const [profile] = await db.select().from(clinicProfile).where(eq(clinicProfile.organizationId, orgId)).limit(1)

  let customerId = profile?.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      name: org.name,
      metadata: { organizationId: orgId },
    })
    customerId = customer.id

    if (profile) {
      await db.update(clinicProfile).set({ stripeCustomerId: customerId }).where(eq(clinicProfile.organizationId, orgId))
    } else {
      await db.insert(clinicProfile).values({
        organizationId: orgId,
        legalName: org.name,
        displayName: org.name,
        stripeCustomerId: customerId,
        planTier: 'basic',
      })
    }
  }

  return {
    userId: session.user.id,
    userEmail: session.user.email,
    organizationId: orgId,
    organizationName: org.name,
    customerId,
  }
}
