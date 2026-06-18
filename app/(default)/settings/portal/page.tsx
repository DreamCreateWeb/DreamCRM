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
import PortalSettingsForm from './portal-settings-form'
import { PageHeader } from '@/components/ui/page-header'

export default async function PortalSettingsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')

  const [settings, shopConfig, connectReady] = await Promise.all([
    getPortalSettings(ctx.organizationId),
    getShopConfig(ctx.organizationId),
    canTakeBalancePayments(ctx.organizationId),
  ])

  return (
    <>
      <PageHeader
        eyebrow="Clinic settings"
        title="Patient portal"
        subtitle="Your patients' portal, your rules — features, booking windows, and voice."
      />

      <div className="v2-panel mb-8 p-6">
        <div className="max-w-2xl">
          <PortalSettingsForm
            initial={settings}
            connectReady={connectReady}
            storefrontEnabled={shopConfig.storefrontEnabled}
          />
        </div>
      </div>
    </>
  )
}
