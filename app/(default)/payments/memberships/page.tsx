import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { listPlans, listMembers, getMembershipStats } from '@/lib/services/membership'
import MembershipsClient from './memberships-client'

export const metadata = { title: 'Memberships - DreamCRM' }
export const dynamic = 'force-dynamic'

export default async function MembershipsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const [plans, members, stats, orgRow] = await Promise.all([
    listPlans(ctx.organizationId),
    listMembers(ctx.organizationId),
    getMembershipStats(ctx.organizationId),
    db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, ctx.organizationId)).limit(1),
  ])

  const publicBase = orgRow[0] ? `/site/${orgRow[0].slug}/membership` : null

  return (
    <MembershipsClient
      plans={plans}
      members={members}
      stats={stats}
      publicBase={publicBase}
      orgName={ctx.organizationName}
    />
  )
}
