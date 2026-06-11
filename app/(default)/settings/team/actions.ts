'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db, schema } from '@/lib/db'
import { sendInvitationEmail } from '@/lib/email'

/**
 * Team management is available to owner / admin of any org type (clinic
 * or platform). Patient-tenant users have no team concept. Member-role
 * users can only see the team list, not invite or remove.
 */
async function requireTeamAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') {
    throw new Error('Forbidden: team management is not available to patients.')
  }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('Forbidden: only owners and admins can manage the team.')
  }
  return ctx
}

const InviteInput = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
})

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Invite a team member to the active org. Reuses the better-auth
 * invitation table so the existing /accept-invite flow handles claiming
 * the seat. Works for both platform (Dream Create employees) and clinic
 * (dentist / hygienist / front-desk / admin) tenants.
 */
export async function inviteTeamMember(input: unknown) {
  const ctx = await requireTeamAdmin()
  const data = InviteInput.parse(input)
  const email = data.email.toLowerCase().trim()

  // Already a member?
  const existingMember = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(and(eq(schema.member.organizationId, ctx.organizationId), eq(schema.user.email, email)))
    .limit(1)
  if (existingMember.length > 0) {
    throw new Error('That email already belongs to a team member.')
  }

  // Already pending?
  const existingPending = await db
    .select({ id: schema.invitation.id })
    .from(schema.invitation)
    .where(
      and(
        eq(schema.invitation.organizationId, ctx.organizationId),
        eq(schema.invitation.email, email),
        eq(schema.invitation.status, 'pending'),
      ),
    )
    .limit(1)
  if (existingPending.length > 0) {
    throw new Error('An invitation is already pending for that email.')
  }

  const id = randomUUID()
  await db.insert(schema.invitation).values({
    id,
    organizationId: ctx.organizationId,
    email,
    role: data.role,
    status: 'pending',
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    inviterId: ctx.userId,
  })

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dreamcreatestudio.com'
  try {
    await sendInvitationEmail(email, {
      inviterName: ctx.userName ?? 'Dream Create',
      orgName: ctx.organizationName,
      role: data.role,
      inviteUrl: `${base}/accept-invite?token=${id}`,
    })
  } catch (err) {
    // Email failed but the row exists — surface a warning, don't roll back.
    console.warn('[invite] email send failed; invitation is still valid', err)
  }

  revalidatePath('/settings/team')
  return { ok: true, id }
}

export async function cancelTeamInvitation(invitationId: string) {
  const ctx = await requireTeamAdmin()
  await db
    .update(schema.invitation)
    .set({ status: 'cancelled' })
    .where(
      and(eq(schema.invitation.id, invitationId), eq(schema.invitation.organizationId, ctx.organizationId)),
    )
  revalidatePath('/settings/team')
  return { ok: true }
}

export async function removeTeamMember(userId: string) {
  const ctx = await requireTeamAdmin()
  if (userId === ctx.userId) {
    throw new Error("You can't remove yourself.")
  }
  await db
    .delete(schema.member)
    .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, ctx.organizationId)))
  revalidatePath('/settings/team')
  return { ok: true }
}

const RoleChangeInput = z.object({
  userId: z.string().min(1),
  role: z.enum(['admin', 'member']),
})

/**
 * Change a teammate's role between member ↔ admin. Gating rules:
 *  - only owners/admins can change roles (requireTeamAdmin)
 *  - nobody can change their OWN role (you can't demote/lock yourself out)
 *  - the owner's role is immutable here — you can't promote someone to owner
 *    or demote the owner (ownership transfer is a separate, deliberate flow)
 *  - the target must be a real member of this org (scoped update)
 */
export async function changeTeamMemberRole(input: unknown) {
  const ctx = await requireTeamAdmin()
  const { userId, role } = RoleChangeInput.parse(input)

  if (userId === ctx.userId) {
    throw new Error("You can't change your own role.")
  }

  const [target] = await db
    .select({ role: schema.member.role })
    .from(schema.member)
    .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, ctx.organizationId)))
    .limit(1)
  if (!target) {
    throw new Error('That person is not a member of this workspace.')
  }
  if (target.role === 'owner') {
    throw new Error("The owner's role can't be changed here.")
  }

  await db
    .update(schema.member)
    .set({ role })
    .where(and(eq(schema.member.userId, userId), eq(schema.member.organizationId, ctx.organizationId)))
  revalidatePath('/settings/team')
  return { ok: true }
}
