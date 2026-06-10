import { redirect } from 'next/navigation'
import SettingsSidebar from '../settings-sidebar'
import PlansPanel from './plans-panel'
import { requireUser } from '@/lib/session'
import { getTenantContext } from '@/lib/auth/context'
import { getBilling } from '@/lib/services/settings'
import { PageHeader } from '@/components/ui/page-header'

export const metadata = {
  title: 'Plans Settings - DreamCRM',
  description: 'Pick the plan that fits',
}

export const dynamic = 'force-dynamic'

export default async function PlansSettings() {
  const user = await requireUser()
  const ctx = await getTenantContext()
  // Plans live in the SaaS-customer subscription flow. The platform tenant
  // (Dream Create) sells the plans, and patients aren't direct customers —
  // both should bounce away rather than land on a dead page.
  if (ctx && ctx.tenantType !== 'clinic') redirect('/settings/account')
  const billing = await getBilling(user.id)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader eyebrow="Settings" title="Plan" subtitle="Your subscription tier and billing." />
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx?.tenantType} />
          <PlansPanel currentPlan={(billing?.plan ?? 'free') as 'free' | 'pro' | 'team' | 'enterprise'} />
        </div>
      </div>
    </div>
  )
}
