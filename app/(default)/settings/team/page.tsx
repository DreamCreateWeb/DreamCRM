import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import SettingsSidebar from '../settings-sidebar'
import TeamPanel from './team-panel'
import { listPendingInvitations, listTeamMembers } from '@/lib/services/messages'

export const metadata = {
  title: 'Team - DreamCRM',
  description: 'Manage Dream Create team members and invitations',
}

export const dynamic = 'force-dynamic'

export default async function TeamSettings() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform') redirect('/settings/account')

  const [members, invitations] = await Promise.all([
    listTeamMembers(ctx.organizationId),
    listPendingInvitations(ctx.organizationId),
  ])

  return (
    <div className="bg-white dark:bg-gray-900 shadow-sm rounded-xl mb-8">
      <div className="flex flex-col md:flex-row md:-mr-px">
        <SettingsSidebar tenantType={ctx.tenantType} />
        <TeamPanel
          members={members.map((m) => ({
            userId: m.userId,
            name: m.name,
            email: m.email,
            role: m.role,
            joinedAt: m.joinedAt,
            isCurrent: m.userId === ctx.userId,
          }))}
          invitations={invitations}
        />
      </div>
    </div>
  )
}
