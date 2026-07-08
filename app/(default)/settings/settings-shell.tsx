'use client'

import { usePathname } from 'next/navigation'
import { useRealtimeRefresh } from '@/components/realtime/realtime-provider'

/**
 * Chooses the settings layout by route. The home (`/settings`) is its own
 * full-width card-grid navigation; every focused page renders in a single
 * comfortable centered column. There's no cross-page rail anymore — the
 * `/settings` home IS the cross-page navigation, and each focused page carries a
 * "‹ Settings" link back to it in its header (see `SettingsPage`).
 *
 * One refresher here makes EVERY settings page live: when a teammate saves a
 * setting (any settings action publishes the `settings` topic), the open page
 * soft-refreshes so two staff never edit stale config. Force-dynamic pages pick
 * up the new values; client form state is preserved across the refresh.
 */
export default function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  useRealtimeRefresh('settings')
  if (pathname === '/settings') return <>{children}</>
  return <div className="mx-auto w-full max-w-4xl">{children}</div>
}
