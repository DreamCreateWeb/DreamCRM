import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import SettingsSidebar from '../settings-sidebar'
import TeamPanel from './team-panel'
import { listPendingInvitations, listTeamMembers } from '@/lib/services/messages'

export const metadata = {
  title: 'Team - DreamCRM',
  description: 'Manage team members and invitations',
}

export const dynamic = 'force-dynamic'

export default async function TeamSettings() {
  const ctx = await requireTenant()
  // Team management is available to clinic + platform tenants; patients
  // have no team concept.
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  const [members, invitations] = await Promise.all([
    listTeamMembers(ctx.organizationId),
    listPendingInvitations(ctx.organizationId),
  ])

  return (
    <div className="v2-panel mb-8">
      <div className="flex flex-col md:flex-row md:-mr-px">
        <SettingsSidebar tenantType={ctx.tenantType} />
        <TeamPanel
          canManage={ctx.role === 'owner' || ctx.role === 'admin'}
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
