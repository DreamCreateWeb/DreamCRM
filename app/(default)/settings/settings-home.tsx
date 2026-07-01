'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { searchSettings, settingsEntryHref } from './search-index'
import { settingsNavGroups, iconForHref, type SettingsTenant } from './settings-nav'
import type { ReactNode } from 'react'

/**
 * The Settings home — a calm, grouped card grid that IS the navigation. Landing
 * on `/settings` shows every area (clinic/platform groups + your account + help)
 * as tiles you click into. One subtle aura header up top is the single brand
 * moment; the tiles are etched `.v2-card-interactive` surfaces.
 */
export default function SettingsHome({ tenantType }: { tenantType: SettingsTenant }) {
  const groups = settingsNavGroups(tenantType)
  const [query, setQuery] = useState('')
  const searching = query.trim().length > 0
  const results = searching
    ? [...searchSettings(query, tenantType), ...searchSettings(query, 'user')]
    : []
  const searchRef = useRef<HTMLInputElement>(null)

  return (
    <div className="section-enter">
      {/* Hero — the one place brand aura is welcome (chrome, never behind data). */}
      <div className="aura-chrome -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 -mt-8 pt-8 pb-6 mb-8 rounded-lg">
        <div className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
          Settings
        </div>
        <h1 className="mt-1 text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {tenantType === 'platform' ? 'Platform settings' : 'Clinic settings'}
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
          Everything that runs your {tenantType === 'platform' ? 'platform' : 'clinic'} — plus your own
          account. Pick an area to jump in.
        </p>

        <div className="relative mt-5 max-w-md">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 fill-current text-gray-400 dark:text-gray-500"
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
            className="w-full rounded-[var(--r-md)] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 pl-9 pr-8 py-2 text-sm text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); searchRef.current?.focus() }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              <svg className="h-3 w-3 fill-current" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M9.4 8l4.3-4.3a1 1 0 1 0-1.4-1.4L8 6.6 3.7 2.3a1 1 0 0 0-1.4 1.4L6.6 8l-4.3 4.3a1 1 0 1 0 1.4 1.4L8 9.4l4.3 4.3a1 1 0 0 0 1.4-1.4L9.4 8Z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {searching ? (
        results.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map((e) => (
              <Tile
                key={`${settingsEntryHref(e)}-${e.label}`}
                href={settingsEntryHref(e)}
                icon={iconForHref(e.href)}
                label={e.label}
                desc={e.page}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">No settings match “{query}”.</p>
        )
      ) : (
        groups.map((group) => (
          <section key={group.title} className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {group.title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.items.map((item) => (
                <Tile key={item.href} href={item.href} icon={item.icon} label={item.label} desc={item.desc} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function Tile({ href, icon, label, desc }: { href: string; icon: ReactNode; label: string; desc: string }) {
  return (
    <Link href={href} className="v2-card-interactive flex items-start gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-teal-500/10 text-teal-700 dark:text-teal-300">
        <svg className="h-4 w-4 fill-current" viewBox="0 0 16 16" aria-hidden="true">
          {icon}
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">{desc}</span>
      </span>
    </Link>
  )
}
