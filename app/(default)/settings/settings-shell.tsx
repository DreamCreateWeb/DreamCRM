'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import SettingsSidebar from './settings-sidebar'
import type { SettingsTenant } from './settings-nav'

/**
 * Chooses the settings layout by route: the home (`/settings`) is its own
 * full-width card-grid nav, while every focused page gets the rail beside its
 * content. On mobile there's no rail — a "‹ Settings" link takes you back to the
 * home, which IS the navigation on phones (drill-in / back-out).
 */
export default function SettingsShell({
  tenantType,
  children,
}: {
  tenantType: SettingsTenant
  children: React.ReactNode
}) {
  const pathname = usePathname()
  if (pathname === '/settings') return <>{children}</>

  return (
    <div className="flex flex-col md:flex-row md:gap-8">
      <SettingsSidebar tenantType={tenantType} />
      <div className="grow min-w-0">
        <Link
          href="/settings"
          className="md:hidden mb-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-teal-700 dark:text-gray-400 dark:hover:text-teal-300"
        >
          <svg className="h-3 w-3 fill-current" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6.7 2.3a1 1 0 0 1 0 1.4L4.4 6H14a1 1 0 1 1 0 2H4.4l2.3 2.3a1 1 0 1 1-1.4 1.4l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 1.4 0Z" />
          </svg>
          Settings
        </Link>
        {children}
      </div>
    </div>
  )
}
