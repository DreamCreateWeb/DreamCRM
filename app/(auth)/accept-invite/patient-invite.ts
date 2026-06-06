'use server'

import { headers } from 'next/headers'
import { randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db, schema } from '@/lib/db'
import { linkPatientRecord } from './link-patient'

/**
 * Claim a staff-sent PATIENT portal invitation. Distinct from the team
 * `acceptInvitation` flow because better-auth's role set is owner/admin/member
 * only — 'patient' membership is created directly (the same pattern the
 * self-serve /intake-start flow uses), so a patient invite can never land the
 * user in the clinic-admin dashboard.
 *
 * Creates a `member(role='patient')` row, points the session at the clinic,
 * marks the invite accepted, and links the patient record (by email) to the
 * user via the shared linkPatientRecord.
 */
export async function acceptPatientPortalInvite(
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sess = await auth.api.getSession({ headers: await headers() })
  if (!sess?.user) return { ok: false, error: 'Please sign in to accept your invitation.' }

  const [inv] = await db
    .select()
    .from(schema.invitation)
    .where(eq(schema.invitation.id, token))
    .limit(1)
  if (!inv || inv.status !== 'pending' || (inv.expiresAt && new Date() > inv.expiresAt)) {
    return { ok: false, error: 'This invitation is no longer valid.' }
  }
  if (inv.role !== 'patient') return { ok: false, error: 'This is not a patient invitation.' }

  // Bind the invite to its recipient. The better-auth team-accept flow enforces
  // this internally; this custom patient path bypasses better-auth, so we check
  // it ourselves — otherwise a forwarded link could be claimed by any signed-in
  // user, consuming the invitation under the wrong identity.
  if (sess.user.email.trim().toLowerCase() !== inv.email.trim().toLowerCase()) {
    return { ok: false, error: 'This invitation was sent to a different email address. Sign in with that email to accept it.' }
  }

  const [org] = await db
    .select({ type: schema.organization.type })
    .from(schema.organization)
    .where(eq(schema.organization.id, inv.organizationId))
    .limit(1)
  if (!org || org.type !== 'clinic') return { ok: false, error: 'Clinic not found.' }

  // Ensure a patient-role membership (direct insert — not better-auth).
  const [existingMember] = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.userId, sess.user.id), eq(schema.member.organizationId, inv.organizationId)))
    .limit(1)
  if (!existingMember) {
    await db.insert(schema.member).values({
      id: randomUUID(),
      organizationId: inv.organizationId,
      userId: sess.user.id,
      role: 'patient',
    })
  }

  // Point the session at this clinic so the portal resolves the right tenant.
  await db
    .update(schema.session)
    .set({ activeOrganizationId: inv.organizationId })
    .where(eq(schema.session.id, sess.session.id))

  await db
    .update(schema.invitation)
    .set({ status: 'accepted' })
    .where(eq(schema.invitation.id, token))

  // Link the existing (staff-created) patient row to this user by email.
  await linkPatientRecord(token)

  return { ok: true }
}
