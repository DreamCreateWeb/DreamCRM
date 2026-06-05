'use server'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { invitation, organization } from '@/lib/db/schema/auth'

export interface InvitationDetails {
  email: string
  orgName: string
  role: string
  expired: boolean
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
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, row.orgId))
    .limit(1)

  return {
    email: row.email,
    orgName: org?.name ?? '',
    role: row.role ?? 'member',
    // Anything other than a still-pending invitation can't be accepted
    // (accepted / canceled / rejected all count as no-longer-usable), as does
    // a past expiry. better-auth blocks non-pending accepts server-side; this
    // surfaces it as a clean "expired" state instead of a generic error.
    expired: row.status !== 'pending' || new Date() > row.expiresAt,
  }
}
