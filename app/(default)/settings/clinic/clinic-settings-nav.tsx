'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Sticky HORIZONTAL section nav for the Clinic profile hub. Replaces the old
 * second left-rail (which stacked beside the main settings rail — three rails on
 * one screen). Now it's a single scrollable chip bar pinned under the header:
 * every section is one tap away, the current section highlights on scroll
 * (IntersectionObserver), and the settings smart-search deep link (`?tab=&sub=`)
 * still scrolls to the exact section on load.
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
  const items = groups.flatMap((g) => g.items)
  const ids = items.map((i) => i.id)
  const [active, setActive] = useState<string>(ids[0] ?? '')
  const params = useSearchParams()

  // Smart-search deep link: land on the matching section on load.
  useEffect(() => {
    const target = params?.get('sub') || params?.get('tab')
    if (!target) return
    const el = document.getElementById(target)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'start' })
      setActive(target)
    }
  }, [params])

  // Scrollspy — highlight the section nearest the top (below the sticky chrome).
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
      { rootMargin: '-120px 0px -55% 0px', threshold: 0 },
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
    <nav
      aria-label="Clinic settings sections"
      className="sticky top-16 z-10 mb-6 -mx-1 border-b border-gray-100 dark:border-gray-800 bg-[color:var(--color-canvas)]/85 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--color-canvas)]/70"
    >
      <div className="flex gap-1 overflow-x-auto no-scrollbar px-1 py-2">
        {items.map((it) => {
          const on = it.id === active
          return (
            <a
              key={it.id}
              href={`#${it.id}`}
              onClick={(e) => jump(e, it.id)}
              aria-current={on ? 'true' : undefined}
              className={`whitespace-nowrap rounded-[var(--r-pill)] px-3 py-1.5 text-sm transition-colors ${
                on
                  ? 'bg-teal-500/12 font-medium text-teal-700 dark:text-teal-300'
                  : 'text-gray-600 hover:bg-gray-500/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]'
              }`}
            >
              {it.label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}
