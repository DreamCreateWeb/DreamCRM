export const dynamic = 'force-dynamic'

import { requireTenant } from '@/lib/auth/context'
import SettingsShell from './settings-shell'

/**
 * Thin shared container for every /settings route. The two-column vs full-width
 * decision (rail beside a focused page vs the full-width home) is made per-route
 * by <SettingsShell>. Patient/partner tenants never reach these pages (they
 * redirect), so the rail is only wired for clinic + platform.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant()
  const showRail = ctx.tenantType === 'clinic' || ctx.tenantType === 'platform'
  const tenant = ctx.tenantType === 'platform' ? 'platform' : 'clinic'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {showRail ? <SettingsShell tenantType={tenant}>{children}</SettingsShell> : children}
    </div>
  )
}
