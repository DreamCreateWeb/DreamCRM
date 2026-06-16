import { redirect } from 'next/navigation'
import SettingsSidebar from '../settings-sidebar'
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

  const { upgrade } = await searchParams
  // Interval is a cheap read off the live subscription; plan/status come from
  // the org-scoped clinic_profile that the tenant context already resolved.
  const summary = await getOrgSubscriptionSummary(ctx.organizationId)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader eyebrow="Settings" title="Plan" subtitle="Your subscription tier and billing." />
      <div className="v2-panel mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx.tenantType} />
          <PlansPanel
            currentPlanId={ctx.planTier}
            subscriptionStatus={ctx.subscriptionStatus ?? null}
            currentInterval={summary?.interval ?? null}
            onTrial={ctx.onTrial ?? false}
            upgradeModuleLabel={upgrade ? getModuleLabel('clinic', upgrade) ?? null : null}
          />
        </div>
      </div>
    </div>
  )
}
