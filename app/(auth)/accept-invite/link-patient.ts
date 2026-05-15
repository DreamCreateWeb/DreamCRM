'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'
import { member } from '@/lib/db/schema/auth'
import { and, eq } from 'drizzle-orm'

/**
 * Called after a patient accepts their portal invitation.
 * Finds their patient record by email in their new org and links userId.
 */
export async function linkPatientRecord(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return

  const orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
  if (!orgId) return

  // Only link if this user has the 'patient' role in the org
  const [memberRow] = await db
    .select()
    .from(member)
    .where(and(eq(member.userId, session.user.id), eq(member.organizationId, orgId)))
    .limit(1)

  if (!memberRow || memberRow.role !== 'patient') return

  // Find their patient record by email (no userId yet)
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
