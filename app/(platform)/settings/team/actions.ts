'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { member, invitation } from '@/lib/db/schema/auth'

async function requireOrgId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('Not authenticated')
  const orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
  if (!orgId) throw new Error('No active organization')
  return orgId
}

export async function inviteMember(formData: FormData) {
  const email = formData.get('email')?.toString().trim()
  const role = formData.get('role')?.toString().trim() || 'member'
  if (!email) throw new Error('Email is required')

  try {
    await auth.api.createInvitation({
      headers: await headers(),
      body: { email, role: role as 'admin' | 'member', resend: false },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not send invite'
    throw new Error(msg)
  }

  revalidatePath('/settings/team')
}

export async function removeMember(memberId: string) {
  const orgId = await requireOrgId()
  await db.delete(member).where(and(eq(member.id, memberId), eq(member.organizationId, orgId)))
  revalidatePath('/settings/team')
}

export async function updateMemberRole(memberId: string, role: string) {
  const orgId = await requireOrgId()
  await db
    .update(member)
    .set({ role })
    .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)))
  revalidatePath('/settings/team')
}

export async function cancelInvitation(invitationId: string) {
  const orgId = await requireOrgId()
  await db
    .delete(invitation)
    .where(and(eq(invitation.id, invitationId), eq(invitation.organizationId, orgId)))
  revalidatePath('/settings/team')
}
