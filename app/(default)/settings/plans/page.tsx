import SettingsSidebar from '../settings-sidebar'
import PlansPanel from './plans-panel'
import { requireUser } from '@/lib/session'
import { getTenantContext } from '@/lib/auth/context'
import { getBilling } from '@/lib/services/settings'

export const metadata = {
  title: 'Plans Settings - DreamCRM',
  description: 'Pick the plan that fits',
}

export const dynamic = 'force-dynamic'

export default async function PlansSettings() {
  const user = await requireUser()
  const ctx = await getTenantContext()
  const billing = await getBilling(user.id)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Account Settings</h1>
      </div>
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx?.tenantType} />
          <PlansPanel currentPlan={(billing?.plan ?? 'free') as 'free' | 'pro' | 'team' | 'enterprise'} />
        </div>
      </div>
    </div>
  )
}
