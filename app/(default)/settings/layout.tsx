export const dynamic = 'force-dynamic'

import { requireTenant } from '@/lib/auth/context'
import SettingsShell from './settings-shell'

/**
 * Thin shared container for every /settings route. Gutters + width belong to
 * <PageFrame> (the home asks for the wide frame, a focused page for 4xl). There's
 * no cross-page rail — the `/settings` home is the navigation, and each focused
 * page links back to it from its header.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireTenant()

  return (
    <SettingsShell>{children}</SettingsShell>
  )
}
