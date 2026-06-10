export const metadata = {
  title: 'Patient Portal Settings - DreamCRM',
  description: 'Choose what patients can see and do in your portal',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getPortalSettings } from '@/lib/services/portal-settings'
import { getShopConfig } from '@/lib/services/shop'
import { canTakeBalancePayments } from '@/lib/services/balance-payments'
import SettingsSidebar from '../settings-sidebar'
import PortalSettingsForm from './portal-settings-form'

export default async function PortalSettingsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')

  const [settings, shopConfig, connectReady] = await Promise.all([
    getPortalSettings(ctx.organizationId),
    getShopConfig(ctx.organizationId),
    canTakeBalancePayments(ctx.organizationId),
  ])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          Patient portal
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Your patients&apos; portal, your rules — features, booking windows, and voice.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx.tenantType} />
          <div className="grow p-6 bg-gray-50 dark:bg-gray-900/20 rounded-r-xl">
            <div className="max-w-2xl">
              <PortalSettingsForm
                initial={settings}
                connectReady={connectReady}
                storefrontEnabled={shopConfig.storefrontEnabled}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
