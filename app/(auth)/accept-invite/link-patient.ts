'use server'

import { headers } from 'next/headers'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'
import { member, invitation } from '@/lib/db/schema/auth'

/**
 * Called after a patient accepts their portal invitation.
 * Finds their patient record by email in their new org and links userId.
 *
 * The org is resolved from the INVITATION token, not the session's
 * activeOrganizationId — accepting an invite doesn't reliably set the active
 * org (especially for a brand-new sign-up whose session has none yet), so
 * relying on it silently skipped the link and left the patient with no
 * patientId in context. The token's org is authoritative. Falls back to the
 * active org if the token can't be resolved.
 *
 * Silent no-op if:
 *  - User isn't signed in
 *  - The org can't be resolved
 *  - User isn't a patient role in that org
 *  - Patient record can't be found, or is already linked
 */
export async function linkPatientRecord(invitationToken?: string): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return

  let orgId: string | null = null
  if (invitationToken) {
    const [inv] = await db
      .select({ organizationId: invitation.organizationId })
      .from(invitation)
      .where(eq(invitation.id, invitationToken))
      .limit(1)
    orgId = inv?.organizationId ?? null
  }
  if (!orgId) {
    orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null
  }
  if (!orgId) return

  const [memberRow] = await db
    .select()
    .from(member)
    .where(and(eq(member.userId, session.user.id), eq(member.organizationId, orgId)))
    .limit(1)

  if (!memberRow || memberRow.role !== 'patient') return

  const [patientRow] = await db
    .select()
    .from(patient)
    .where(and(eq(patient.organizationId, orgId), eq(patient.email, session.user.email)))
    .limit(1)

  if (!patientRow || patientRow.userId) return

  await db
    .update(patient)
    .set({
      userId: session.user.id,
      source: patientRow.source ?? 'invite',
      lastActivityAt: new Date(),
    })
    .where(eq(patient.id, patientRow.id))
}
