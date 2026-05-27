import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { listJobs, listApplications, getApplicationCounts, getCareersStats } from '@/lib/services/careers'
import CareersClient from './careers-client'

export const metadata = { title: 'Careers - DreamCRM' }
export const dynamic = 'force-dynamic'

export default async function CareersPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const [jobs, applications, counts, stats, orgRow] = await Promise.all([
    listJobs(ctx.organizationId),
    listApplications(ctx.organizationId),
    getApplicationCounts(ctx.organizationId),
    getCareersStats(ctx.organizationId),
    db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, ctx.organizationId)).limit(1),
  ])

  const publicBase = orgRow[0] ? `/site/${orgRow[0].slug}/careers` : null

  return (
    <CareersClient jobs={jobs} applications={applications} counts={counts} stats={stats} publicBase={publicBase} />
  )
}
