'use server'

import { headers } from 'next/headers'
import { randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth/server'
import { db, schema } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'

const LinkInput = z.object({
  orgId: z.string().min(1),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
})

/**
 * Links the currently-signed-in user to the given clinic org as a patient.
 * Called by the intake-start flow after the user has just signed up or
 * signed in via better-auth on the client. Idempotent:
 *
 *   • If a patient row already exists in the org with this email + no
 *     userId, links it to the new user.
 *   • If the user already has a patient record in the org, no-op.
 *   • Otherwise, creates a brand-new patient row.
 *
 * Also ensures the user has a `member(role: 'patient')` row for the org
 * and that `session.activeOrganizationId` is pointing at this clinic, so
 * the next request (against `/patient/intake`) resolves the right tenant
 * context.
 *
 * Throws on auth failure (no session) — the client component should
 * recover by re-prompting auth.
 */
export async function linkUserToClinicAsPatient(input: z.infer<typeof LinkInput>) {
  const data = LinkInput.parse(input)
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Please sign in and try again.')

  // Confirm the org exists and is a clinic (defensive — the caller pulled
  // orgId from the SSR'd page, but never trust client input on writes).
  const [org] = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.id, data.orgId))
    .limit(1)
  if (!org || org.type !== 'clinic') throw new Error('We couldn’t find this clinic. Please refresh and try again.')

  // Ensure member row.
  const [existingMember] = await db
    .select()
    .from(schema.member)
    .where(
      and(
        eq(schema.member.userId, session.user.id),
        eq(schema.member.organizationId, data.orgId),
      ),
    )
    .limit(1)
  if (!existingMember) {
    await db.insert(schema.member).values({
      id: randomUUID(),
      organizationId: data.orgId,
      userId: session.user.id,
      role: 'patient',
    })
  }

  // Ensure patient row. Three paths:
  //   1) Already linked to this user → no-op.
  //   2) Unlinked row exists at this email → adopt it.
  //   3) Nothing matches → create a fresh row.
  const [linkedRow] = await db
    .select()
    .from(patient)
    .where(and(eq(patient.organizationId, data.orgId), eq(patient.userId, session.user.id)))
    .limit(1)
  if (!linkedRow) {
    const [emailMatch] = session.user.email
      ? await db
          .select()
          .from(patient)
          .where(and(eq(patient.organizationId, data.orgId), eq(patient.email, session.user.email)))
          .limit(1)
      : [undefined]

    if (emailMatch && !emailMatch.userId) {
      await db
        .update(patient)
        .set({
          userId: session.user.id,
          firstName: emailMatch.firstName || data.firstName,
          lastName: emailMatch.lastName || data.lastName,
          phone: emailMatch.phone ?? data.phone ?? null,
          lastActivityAt: new Date(),
        })
        .where(eq(patient.id, emailMatch.id))
    } else if (!emailMatch) {
      await db.insert(patient).values({
        id: randomUUID(),
        organizationId: data.orgId,
        userId: session.user.id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: session.user.email ?? null,
        phone: data.phone ?? null,
        source: 'self_signup',
        firstSeenAt: new Date(),
        lastActivityAt: new Date(),
      })
    }
    // (If emailMatch exists but is already linked to a different user, we
    // skip — both rows can coexist; staff can merge in the dashboard.)
  }

  // Switch the session over to this clinic so /patient/intake resolves it
  // as the active tenant. Mirrors the onboarding action's final step.
  await db
    .update(schema.session)
    .set({ activeOrganizationId: data.orgId })
    .where(eq(schema.session.id, session.session.id))
}
