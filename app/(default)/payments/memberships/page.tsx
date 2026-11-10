import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db, schema } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { listPlans, listMembers, getMembershipStats } from '@/lib/services/membership'
import MembershipsClient from './memberships-client'

export const metadata = { title: 'Memberships - DreamCRM' }
export const dynamic = 'force-dynamic'

export default async function MembershipsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'caller') redirect('/calls')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const [plans, members, stats, orgRow, profileRow] = await Promise.all([
    listPlans(ctx.organizationId),
    listMembers(ctx.organizationId),
    getMembershipStats(ctx.organizationId),
    db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, ctx.organizationId)).limit(1),
    db.select({ websiteDomain: schema.clinicProfile.websiteDomain }).from(schema.clinicProfile).where(eq(schema.clinicProfile.organizationId, ctx.organizationId)).limit(1),
  ])

  const publicBase = orgRow[0] ? `/site/${orgRow[0].slug}/membership` : null

  // The clinic's own site address (custom domain when set) - the invite link
  // lands on the public join form there, never on the app host.
  const siteBase = orgRow[0]
    ? publicSiteUrl({ slug: orgRow[0].slug, profile: { websiteDomain: profileRow[0]?.websiteDomain ?? null } } as Parameters<typeof publicSiteUrl>[0])
    : null

  return (
    <MembershipsClient
      plans={plans}
      members={members}
      stats={stats}
      publicBase={publicBase}
      inviteBase={siteBase ? `${siteBase}/dental-plans` : null}
      orgName={ctx.organizationName}
    />
  )
}
