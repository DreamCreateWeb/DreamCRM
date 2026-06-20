'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Sticky in-page section rail for the Clinic settings hub. Replaces the old
 * nested-tab maze (4 tabs → 15 hidden subtab panels): every section is listed
 * at once, so a clinic owner finds "Hours" or "Services" in a glance and jumps
 * straight there. Highlights the section currently in view (IntersectionObserver)
 * and honors the settings smart-search deep link (`?tab=&sub=`) by scrolling to
 * the matching section on load — so a search result still lands on the exact
 * setting even though the page no longer uses SettingsTabs.
 */

export interface NavItem {
  id: string
  label: string
}
export interface NavGroup {
  label: string
  items: NavItem[]
}

export default function ClinicSettingsNav({ groups }: { groups: NavGroup[] }) {
  const ids = groups.flatMap((g) => g.items.map((i) => i.id))
  const [active, setActive] = useState<string>(ids[0] ?? '')
  const params = useSearchParams()

  // Smart-search deep link: the rail builds `?tab=&sub=` hrefs; the leaf id we
  // want to land on is the sub (or the tab when a section has no sub). Scroll to
  // it on load so search results stay precise.
  useEffect(() => {
    const target = params?.get('sub') || params?.get('tab')
    if (!target) return
    const el = document.getElementById(target)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'start' })
      setActive(target)
    }
  }, [params])

  // Scrollspy — highlight the section nearest the top of the viewport.
  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => e !== null)
    if (els.length === 0) return
    const obs = new IntersectionObserver(
      (entries) => {
        const onscreen = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (onscreen[0]?.target.id) setActive(onscreen[0].target.id)
      },
      { rootMargin: '-80px 0px -55% 0px', threshold: 0 },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')])

  function jump(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id)
    if (!el || typeof el.scrollIntoView !== 'function') return
    e.preventDefault()
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
    if (typeof history !== 'undefined') history.replaceState(null, '', `#${id}`)
  }

  return (
    <nav aria-label="Clinic settings sections" className="hidden lg:block">
      <div className="sticky top-20 space-y-5">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="px-2 mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
              {g.label}
            </p>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const on = it.id === active
                return (
                  <li key={it.id}>
                    <a
                      href={`#${it.id}`}
                      onClick={(e) => jump(e, it.id)}
                      aria-current={on ? 'true' : undefined}
                      className={`block rounded-md border-l-2 px-2 py-1.5 text-sm transition-colors ${
                        on
                          ? 'border-teal-500 bg-teal-500/10 font-medium text-teal-700 dark:text-teal-300'
                          : 'border-transparent text-ink-600 hover:bg-ink-900/[0.04] hover:text-ink-900 dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      {it.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}
