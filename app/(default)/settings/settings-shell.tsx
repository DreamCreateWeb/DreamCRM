'use client'

import { usePathname } from 'next/navigation'

/**
 * Chooses the settings layout by route. The home (`/settings`) is its own
 * full-width card-grid navigation; every focused page renders in a single
 * comfortable centered column. There's no cross-page rail anymore — the
 * `/settings` home IS the cross-page navigation, and each focused page carries a
 * "‹ Settings" link back to it in its header (see `SettingsPage`).
 */
export default function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/settings') return <>{children}</>
  return <div className="mx-auto w-full max-w-4xl">{children}</div>
}
