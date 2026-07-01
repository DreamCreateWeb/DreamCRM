'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { searchSettings, settingsEntryHref } from './search-index'
import { settingsNavGroups, iconForHref, type SettingsTenant } from './settings-nav'

/**
 * The focused-page settings rail. Rebuilt to v2 quality:
 *   • fixed width (the old drag-resize handle + persisted width were fiddly and
 *     gone);
 *   • ONE unified list — org groups + "Your account" + Help — so there's no
 *     surface split and no buried footer switcher (the biggest "rough" edges);
 *   • a "‹ Settings" link back to the card-grid home at the top;
 *   • deep search across the org surface AND the personal pages, with the right
 *     icon per result;
 *   • desktop only — on mobile the home is the nav (the shell renders a
 *     "‹ Settings" back link above the content instead).
 */
export default function SettingsSidebar({ tenantType = 'clinic' }: { tenantType?: SettingsTenant }) {
  const pathname = usePathname()
  const groups = settingsNavGroups(tenantType)

  const [query, setQuery] = useState('')
  const searching = query.trim().length > 0
  const results = searching
    ? [...searchSettings(query, tenantType), ...searchSettings(query, 'user')]
    : []
  const noResults = searching && results.length === 0
  const searchRef = useRef<HTMLInputElement>(null)

  // Clear a stale query + scroll the active item into view when the page changes.
  const activeRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    setQuery('')
    const id = requestAnimationFrame(() => activeRef.current?.scrollIntoView({ block: 'nearest' }))
    return () => cancelAnimationFrame(id)
  }, [pathname])

  return (
    <nav
      aria-label="Settings"
      className="hidden md:flex md:flex-col md:w-60 md:shrink-0 md:sticky md:top-16 md:self-start md:max-h-[calc(100dvh-5rem)] md:pt-1 md:pr-1"
    >
      {/* Back to the settings home. */}
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1.5 px-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-teal-700 dark:text-gray-400 dark:hover:text-teal-300 transition-colors"
      >
        <svg className="h-3 w-3 fill-current" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6.7 2.3a1 1 0 0 1 0 1.4L4.4 6H14a1 1 0 1 1 0 2H4.4l2.3 2.3a1 1 0 1 1-1.4 1.4l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 1.4 0Z" />
        </svg>
        Settings
      </Link>

      {/* Deep search over every setting. */}
      <div className="px-0.5 mb-3">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 fill-current text-gray-400 dark:text-gray-500"
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <path d="M7 14a7 7 0 1 1 4.94-2.06l3.56 3.56a1 1 0 0 1-1.42 1.42l-3.56-3.56A6.97 6.97 0 0 1 7 14Zm0-2a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Search settings…"
            aria-label="Search settings"
            className="w-full rounded-[var(--r-sm)] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 pl-8 pr-7 py-1.5 text-sm text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); searchRef.current?.focus() }}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              <svg className="h-3 w-3 fill-current" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M9.4 8l4.3-4.3a1 1 0 1 0-1.4-1.4L8 6.6 3.7 2.3a1 1 0 0 0-1.4 1.4L6.6 8l-4.3 4.3a1 1 0 1 0 1.4 1.4L8 9.4l4.3 4.3a1 1 0 0 0 1.4-1.4L9.4 8Z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto overflow-x-hidden space-y-4 grow min-h-0 -mr-1.5 pr-1.5">
        {searching ? (
          <ul className="space-y-0.5">
            {results.map((e) => {
              const href = settingsEntryHref(e)
              return (
                <li key={`${href}-${e.label}`}>
                  <Link
                    href={href}
                    onClick={() => setQuery('')}
                    className="flex items-start gap-2 px-2.5 py-1.5 rounded-[var(--r-sm)] hover:bg-gray-500/[0.06] transition-colors"
                  >
                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-current text-gray-400 dark:text-gray-500" viewBox="0 0 16 16" aria-hidden="true">
                      {iconForHref(e.href)}
                    </svg>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">{e.label}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{e.page}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
            {noResults && (
              <li className="px-2.5 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                No settings match “{query}”.
              </li>
            )}
          </ul>
        ) : (
          groups.map((group) => (
            <div key={group.title}>
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-1">
                {group.title}
              </div>
              <ul>
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                  return (
                    <li key={item.href} className="mb-0.5">
                      <Link
                        href={item.href}
                        ref={active ? activeRef : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={`relative flex items-center px-2.5 py-2 rounded-[var(--r-sm)] transition-colors ${
                          active
                            ? 'bg-teal-500/10 before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-r before:bg-teal-500'
                            : 'hover:bg-gray-500/[0.06]'
                        }`}
                      >
                        <svg
                          className={`shrink-0 fill-current mr-2 ${
                            active ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400 dark:text-gray-500'
                          }`}
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          aria-hidden="true"
                        >
                          {item.icon}
                        </svg>
                        <span
                          className={`text-sm font-medium ${
                            active
                              ? 'text-teal-700 dark:text-teal-300'
                              : 'text-gray-600 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-200'
                          }`}
                        >
                          {item.label}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </nav>
  )
}
