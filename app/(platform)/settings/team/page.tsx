export const metadata = {
  title: 'Team - Dream Create',
  description: 'Manage members and invitations for your clinic',
}

import { redirect } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { member, user, invitation } from '@/lib/db/schema/auth'
import { getTenantContext } from '@/lib/auth/context'
import SettingsSidebar from '../settings-sidebar'
import TeamPanel from './team-panel'

export default async function TeamSettings() {
  const ctx = await getTenantContext()
  if (!ctx) redirect('/signin')

  const members = await db
    .select({
      id: member.id,
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, ctx.organizationId))

  const invites = await db
    .select()
    .from(invitation)
    .where(and(eq(invitation.organizationId, ctx.organizationId), eq(invitation.status, 'pending')))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Team</h1>
      </div>
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar />
          <TeamPanel
            members={members}
            invitations={invites}
            currentUserId={ctx.userId}
            currentRole={ctx.role}
          />
        </div>
      </div>
    </div>
  )
}
