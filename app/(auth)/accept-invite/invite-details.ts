'use server'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { invitation, organization } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'

export interface InvitationDetails {
  email: string
  orgName: string
  role: string
  expired: boolean
  /** 'platform' | 'clinic' — drives whether the page wears the clinic's brand. */
  orgType: string
  /** Clinic branding (only set for clinic orgs) so the invite can match the portal. */
  brand: {
    displayName: string | null
    logoUrl: string | null
    brandColor: string | null
  } | null
  /**
   * Account state for the invite email — drives which affordance the accept
   * page renders (create / password sign-in / magic-link sign-in). One email =
   * one better-auth user across personas, so an invite whose email already has
   * an account must NOT show a create-account form that fails "user already
   * exists" (Bug 2). 'none' for a brand-new email.
   */
  accountState: import('@/lib/auth/account-state').AccountState
}

export async function getInvitationDetails(token: string): Promise<InvitationDetails | null> {
  const [row] = await db
    .select({
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      orgId: invitation.organizationId,
    })
    .from(invitation)
    .where(eq(invitation.id, token))
    .limit(1)

  if (!row) return null

  const [org] = await db
    .select({ name: organization.name, type: organization.type })
    .from(organization)
    .where(eq(organization.id, row.orgId))
    .limit(1)

  // For clinic invites, pull the clinic's branding so the accept-invite screen
  // wears the clinic's identity (logo + brand color) — a patient should feel
  // they're joining THEIR dentist, not generic "DreamCRM". Platform/staff
  // invites keep the default platform style (brand stays null).
  let brand: InvitationDetails['brand'] = null
  if (org?.type === 'clinic') {
    const [profile] = await db
      .select({
        displayName: clinicProfile.displayName,
        logoUrl: clinicProfile.logoUrl,
        brandColor: clinicProfile.brandColor,
      })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, row.orgId))
      .limit(1)
    brand = {
      displayName: profile?.displayName ?? null,
      logoUrl: profile?.logoUrl ?? null,
      brandColor: profile?.brandColor ?? null,
    }
  }

  // Resolve the invite email's account state so the accept page can offer the
  // right path (create / password / magic-link) instead of blindly showing a
  // create-account form that would fail for an email that already has a user.
  const { resolveAccountState } = await import('@/lib/auth/account-state')
  const { state: accountState } = await resolveAccountState(row.email)

  return {
    email: row.email,
    orgName: (brand?.displayName || org?.name) ?? '',
    role: row.role ?? 'member',
    orgType: org?.type ?? 'clinic',
    brand,
    accountState,
    // Anything other than a still-pending invitation can't be accepted
    // (accepted / canceled / rejected all count as no-longer-usable), as does
    // a past expiry. better-auth blocks non-pending accepts server-side; this
    // surfaces it as a clean "expired" state instead of a generic error.
    expired: row.status !== 'pending' || new Date() > row.expiresAt,
  }
}
