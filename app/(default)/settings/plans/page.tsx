import { redirect } from 'next/navigation'
import PlansPanel from './plans-panel'
import { requireTenant } from '@/lib/auth/context'
import { getOrgSubscriptionSummary } from '@/lib/services/billing'
import { PageHeader } from '@/components/ui/page-header'
import { getModuleLabel } from '@/lib/modules'

export const metadata = {
  title: 'Plans Settings - DreamCRM',
  description: 'Pick the plan that fits',
}

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ upgrade?: string }>
}

export default async function PlansSettings({ searchParams }: Props) {
  const ctx = await requireTenant()
  // Plans live in the SaaS-customer subscription flow. The platform tenant
  // (Dream Create) sells the plans, and patients aren't direct customers —
  // both should bounce away rather than land on a dead page.
  if (ctx.tenantType !== 'clinic') redirect('/settings/account')

  // searchParams + the subscription summary are independent — resolve together.
  const [{ upgrade }, summary] = await Promise.all([
    searchParams,
    getOrgSubscriptionSummary(ctx.organizationId),
  ])

  return (
    <>
      <PageHeader eyebrow="Clinic settings" title="Plan" subtitle="Your subscription tier and billing." />
      <div className="v2-panel mb-8">
        <PlansPanel
          currentPlanId={ctx.planTier}
          subscriptionStatus={ctx.subscriptionStatus ?? null}
          currentInterval={summary?.interval ?? null}
          onTrial={ctx.onTrial ?? false}
          upgradeModuleLabel={upgrade ? getModuleLabel('clinic', upgrade) ?? null : null}
        />
      </div>
    </>
  )
}
