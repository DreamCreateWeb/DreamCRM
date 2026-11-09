import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import TeamPanel from './team-panel'
import { listPendingInvitations, listTeamMembers } from '@/lib/services/messages'
import { SettingsPage } from '../settings-kit'
import RequireTwoStep from './require-two-step'
import { db, schema } from '@/lib/db'
import { eq } from 'drizzle-orm'

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

  const showRequire = ctx.tenantType === 'clinic' && ctx.role === 'owner'
  const [req] = showRequire
    ? await db
        .select({ on: schema.clinicProfile.requireTwoFactor })
        .from(schema.clinicProfile)
        .where(eq(schema.clinicProfile.organizationId, ctx.organizationId))
        .limit(1)
    : []

  return (
    <>
      <SettingsPage
        title="Team"
        subtitle={`Invite teammates and manage access. Everyone in your ${ctx.tenantType === 'platform' ? 'team' : 'clinic'} can see this; owners and admins can make changes.`}
      >
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
        {showRequire && <RequireTwoStep initial={req?.on === 1} />}
      </SettingsPage>
    </>
  )
}
