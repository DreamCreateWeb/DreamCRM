'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Persistent sub-nav for the prospecting workspace — before this, the eight
 * sub-pages (call list, sequences, demos, …) were reachable only through
 * ActionButtons scattered across the main page's panels, so moving between
 * two sub-pages meant bouncing through the pipeline every time. One tab row,
 * every surface, always visible.
 */
const TABS: { href: string; label: string; exact?: boolean }[] = [
  { href: '/platform/prospecting', label: 'Pipeline', exact: true },
  { href: '/platform/prospecting/call-list', label: 'Call list' },
  { href: '/platform/prospecting/sequences', label: 'Sequences' },
  { href: '/platform/prospecting/demos', label: 'Demos' },
  { href: '/platform/prospecting/communications', label: 'Communications' },
  { href: '/platform/prospecting/territory', label: 'Territory' },
  { href: '/platform/prospecting/settings', label: 'Settings' },
]

/** Which tab a pathname belongs to — deep pages map to their parent tab
 *  (call-mode → Call list; demo/[id] briefs → Demos). */
function activeTabFor(pathname: string): string {
  if (pathname === '/platform/prospecting') return '/platform/prospecting'
  if (pathname.startsWith('/platform/prospecting/call-mode')) return '/platform/prospecting/call-list'
  if (pathname.startsWith('/platform/prospecting/demo/')) return '/platform/prospecting/demos'
  const tab = TABS.find((t) => !t.exact && (pathname === t.href || pathname.startsWith(`${t.href}/`)))
  return tab?.href ?? '/platform/prospecting'
}

export default function ProspectingNav() {
  const pathname = usePathname()
  const current = activeTabFor(pathname ?? '')
  return (
    <nav
      aria-label="Prospecting sections"
      className="px-4 sm:px-6 lg:px-8 pt-4 w-full max-w-[96rem] mx-auto"
    >
      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700/60 pb-0 overflow-x-auto">
        {TABS.map((t) => {
          const active = current === t.href
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={`whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-teal-500 text-teal-700 dark:text-teal-300'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
