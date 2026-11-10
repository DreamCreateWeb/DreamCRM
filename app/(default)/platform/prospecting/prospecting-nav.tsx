'use client'

import { usePathname } from 'next/navigation'
import { TabLink, Tabs } from '@/components/ui/tabs'

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
  { href: '/platform/prospecting/events', label: 'Events' },
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
      <Tabs label="Prospecting sections">
        {TABS.map((t) => (
          <TabLink key={t.href} href={t.href} active={current === t.href}>
            {t.label}
          </TabLink>
        ))}
      </Tabs>
    </nav>
  )
}
