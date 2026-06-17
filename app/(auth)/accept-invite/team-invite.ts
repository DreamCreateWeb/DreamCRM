'use server'

import { headers } from 'next/headers'
import { randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db, schema } from '@/lib/db'
import { normalizeEmail } from '@/lib/contact-normalize'

/**
 * Claim an owner / admin / member TEAM invitation — the robust, fully-controlled
 * counterpart to better-auth's `organization.acceptInvitation`.
 *
 * Why not better-auth's: that call proved finicky on the managed-provisioning
 * path (a manually-inserted `invitation` row) — it could ERROR after `signUp`
 * had already created + signed in the account, leaving an ORPHANED user
 * (signed in, no membership). An org-less signed-in user is then routed into
 * onboarding, where they create a DUPLICATE clinic instead of joining the one
 * they were invited to. (This is exactly what happened to the first real
 * clinic.) Mirrors `acceptPatientPortalInvite`: validate the token + bind it to
 * its recipient, insert the `member` row directly, point the session at the
 * org, mark the invite accepted. Idempotent — re-running for an already-joined
 * org just re-points the session. Never throws to the caller.
 */
export async function acceptTeamInvite(
  token: string,
): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
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

  // Patient invites go through acceptPatientPortalInvite (role='patient' isn't a
  // better-auth org role) — refuse here so a patient link can't mint a 'member'.
  const role = inv.role === 'admin' || inv.role === 'member' ? inv.role : 'owner'
  if (inv.role === 'patient') {
    return { ok: false, error: 'This is a patient invitation — use the patient sign-in link.' }
  }

  // Bind the invite to its recipient (a forwarded link can't be claimed by a
  // different signed-in account). Normalized compare so casing never blocks it.
  if (normalizeEmail(sess.user.email) !== normalizeEmail(inv.email)) {
    return {
      ok: false,
      error: 'This invitation was sent to a different email address. Sign in with that email to accept it.',
    }
  }

  const [org] = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.id, inv.organizationId))
    .limit(1)
  if (!org) return { ok: false, error: 'That clinic no longer exists.' }

  // Ensure the membership (direct insert — not better-auth). Idempotent.
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
      role,
    })
  }

  // Point the session at this clinic so the dashboard resolves the right tenant
  // on the very next request (no org-less flap into onboarding).
  await db
    .update(schema.session)
    .set({ activeOrganizationId: inv.organizationId })
    .where(eq(schema.session.id, sess.session.id))

  await db
    .update(schema.invitation)
    .set({ status: 'accepted' })
    .where(eq(schema.invitation.id, token))

  return { ok: true, organizationId: inv.organizationId }
}
