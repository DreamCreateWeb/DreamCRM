export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import SettingsHome from './settings-home'

export const metadata = { title: 'Settings - DreamCRM' }

// `/settings` is the card-grid home (the settings navigation). Patient/partner
// tenants don't have a settings surface → send them to their own home.
export default async function SettingsIndex() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic' && ctx.tenantType !== 'platform') redirect('/')
  return <SettingsHome tenantType={ctx.tenantType === 'platform' ? 'platform' : 'clinic'} />
}
