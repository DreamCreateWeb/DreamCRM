import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant, requirePlan } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { listJobs, listApplications, getApplicationCounts, getCareersStats } from '@/lib/services/careers'
import CareersClient from './careers-client'
import ModuleHint from '@/components/onboarding/module-hint'

export const metadata = { title: 'Careers - DreamCRM' }
export const dynamic = 'force-dynamic'

export default async function CareersPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  await requirePlan(ctx, 'premium', 'careers')

  const [jobs, applications, counts, stats, orgRow] = await Promise.all([
    listJobs(ctx.organizationId),
    listApplications(ctx.organizationId),
    getApplicationCounts(ctx.organizationId),
    getCareersStats(ctx.organizationId),
    db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, ctx.organizationId)).limit(1),
  ])

  const publicBase = orgRow[0] ? `/site/${orgRow[0].slug}/careers` : null

    return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pt-6 w-full max-w-[96rem] mx-auto -mb-2">
        <ModuleHint id="careers" />
      </div>
    <CareersClient jobs={jobs} applications={applications} counts={counts} stats={stats} publicBase={publicBase} orgName={ctx.organizationName} />
    </>
  )
}
