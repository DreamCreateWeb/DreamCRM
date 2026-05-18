'use server'

import { headers } from 'next/headers'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'
import { member } from '@/lib/db/schema/auth'

/**
 * Called after a patient accepts their portal invitation.
 * Finds their patient record by email in their new org and links userId.
 *
 * Silent no-op if:
 *  - User isn't signed in
 *  - User has no active org
 *  - User isn't a patient role in that org
 *  - Patient record can't be found, or is already linked
 */
export async function linkPatientRecord(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return

  const orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
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
    .set({ userId: session.user.id })
    .where(eq(patient.id, patientRow.id))
}
