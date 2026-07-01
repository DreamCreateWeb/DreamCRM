export const dynamic = 'force-dynamic'

import { requireTenant } from '@/lib/auth/context'
import SettingsShell from './settings-shell'

/**
 * Thin shared container for every /settings route. The full-width home vs the
 * centered focused-page column is decided per-route by <SettingsShell>. There's
 * no cross-page rail — the `/settings` home is the navigation, and each focused
 * page links back to it from its header.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireTenant()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <SettingsShell>{children}</SettingsShell>
    </div>
  )
}
