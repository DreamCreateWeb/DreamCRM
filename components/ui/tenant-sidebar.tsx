'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppProvider } from '@/app/app-provider'
import Logo from './logo'
import { NavIcon } from './nav-icons'
import type { ModuleDef, TenantType } from '@/lib/modules/types'

interface TenantSidebarProps {
  modules: ModuleDef[]
  /** Display name of the current organization — shown above the nav */
  orgName?: string
  /** Optional badge text (e.g., "Pro Plan", "Patient Portal") */
  badge?: string
  variant?: 'default' | 'v2'
  /** Drives the live unread-count badges (clinic tenants only). */
  tenantType?: TenantType
}

/** Live "needs attention" counts shown as pills next to nav entries. */
interface NavBadgeCounts {
  messages: number
  leads: number
  shop: number
}

/** Maps a module id → which badge count drives its pill. */
const BADGE_FOR_MODULE: Record<string, keyof NavBadgeCounts> = {
  messages: 'messages',
  leads: 'leads',
  shop: 'shop',
}

const BADGE_POLL_MS = 60_000

/**
 * Data-driven sidebar that renders nav based on a list of modules.
 * The module registry (lib/modules/) determines what's shown for each tenant.
 *
 * Modules are grouped by their `section` field (defaults to "Pages").
 * Active route is highlighted by matching the module's `path` against pathname.
 */
export default function TenantSidebar({
  modules,
  orgName,
  badge,
  variant = 'default',
  tenantType,
}: TenantSidebarProps) {
  const sidebar = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const { sidebarOpen, setSidebarOpen, sidebarExpanded } = useAppProvider()
  const [badges, setBadges] = useState<NavBadgeCounts>({ messages: 0, leads: 0, shop: 0 })

  // Live unread-count pills (Messages / Leads / Shop). Clinic tenants only —
  // platform + patient sidebars don't surface those entries. Polls on an
  // interval + on window focus (mirrors the header bell), and stays resilient:
  // any fetch error silently keeps the previous counts rather than blanking.
  const isClinic = tenantType === 'clinic'
  const refreshBadges = useCallback(async () => {
    if (!isClinic) return
    try {
      const res = await fetch('/api/nav-badges', { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as Partial<NavBadgeCounts>
      setBadges({
        messages: Number(json.messages ?? 0),
        leads: Number(json.leads ?? 0),
        shop: Number(json.shop ?? 0),
      })
    } catch {
      // Swallow — keep prior counts; next tick retries.
    }
  }, [isClinic])

  useEffect(() => {
    if (!isClinic) return
    refreshBadges()
    const id = setInterval(refreshBadges, BADGE_POLL_MS)
    const onFocus = () => refreshBadges()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [isClinic, refreshBadges])

  // close on click outside
  useEffect(() => {
    const handler = ({ target }: { target: EventTarget | null }) => {
      if (!sidebar.current) return
      if (!sidebarOpen || sidebar.current.contains(target as Node)) return
      setSidebarOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  })

  // close on escape
  useEffect(() => {
    const handler = ({ keyCode }: { keyCode: number }) => {
      if (!sidebarOpen || keyCode !== 27) return
      setSidebarOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  })

  // Group modules by section, preserving order
  const sections = new Map<string, ModuleDef[]>()
  for (const m of modules) {
    const key = m.section ?? 'Pages'
    if (!sections.has(key)) sections.set(key, [])
    sections.get(key)!.push(m)
  }

  function isActive(path: string) {
    if (path === '/') return pathname === '/'
    return pathname === path || pathname.startsWith(`${path}/`)
  }

  return (
    <div className={`min-w-fit ${sidebarExpanded ? 'sidebar-expanded' : ''}`}>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 bg-gray-900/30 z-40 lg:hidden lg:z-auto transition-opacity duration-200 ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      <div
        id="sidebar"
        ref={sidebar}
        className={`flex lg:flex! flex-col absolute z-40 left-0 top-0 lg:static lg:left-auto lg:top-auto lg:translate-x-0 h-[100dvh] overflow-y-scroll lg:overflow-y-auto no-scrollbar w-64 lg:w-20 lg:sidebar-expanded:!w-64 2xl:w-64! shrink-0 bg-white dark:bg-gray-800 p-4 transition-all duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-64'} ${variant === 'v2' ? 'border-r border-gray-200 dark:border-gray-700/60' : 'rounded-r-2xl shadow-xs'}`}
      >
        {/* Header */}
        <div className="flex justify-between mb-6 pr-3 sm:px-2">
          <button
            className="lg:hidden text-gray-500 hover:text-gray-400"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-controls="sidebar"
            aria-expanded={sidebarOpen}
          >
            <span className="sr-only">Close sidebar</span>
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M10.7 18.7l1.4-1.4L7.8 13H20v-2H7.8l4.3-4.3-1.4-1.4L4 12z" />
            </svg>
          </button>
          <Logo />
        </div>

        {/* Org name + badge */}
        {(orgName || badge) && (
          <div className="px-3 mb-6 lg:hidden lg:sidebar-expanded:block 2xl:block">
            {orgName && (
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{orgName}</div>
            )}
            {badge && (
              <div className="text-xs text-violet-500 font-medium uppercase mt-0.5">{badge}</div>
            )}
          </div>
        )}

        {/* Nav sections */}
        <div className="space-y-8">
          {Array.from(sections.entries()).map(([section, items]) => (
            <div key={section}>
              <h3 className="text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold pl-3">
                <span className="hidden lg:block lg:sidebar-expanded:hidden 2xl:hidden text-center w-6" aria-hidden="true">•••</span>
                <span className="lg:hidden lg:sidebar-expanded:block 2xl:block">{section}</span>
              </h3>
              <ul className="mt-3">
                {items.map((m) => {
                  const active = isActive(m.path)
                  const isSoon = m.status === 'soon'
                  const badgeKey = BADGE_FOR_MODULE[m.id]
                  const badgeCount = badgeKey ? badges[badgeKey] : 0
                  return (
                    <li
                      key={m.id}
                      className={`pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0 ${
                        active
                          ? 'bg-linear-to-r from-violet-500/[0.12] dark:from-violet-500/[0.24] to-violet-500/[0.04]'
                          : ''
                      }`}
                    >
                      <Link
                        href={isSoon ? '#' : m.path}
                        onClick={() => setSidebarOpen(false)}
                        className={`block truncate transition ${
                          active
                            ? 'text-gray-800 dark:text-gray-100'
                            : 'text-gray-800 dark:text-gray-100 hover:text-gray-900 dark:hover:text-white'
                        } ${isSoon ? 'opacity-50 cursor-not-allowed' : ''}`}
                        aria-disabled={isSoon}
                      >
                        <div className="flex items-center">
                          <NavIcon name={m.icon} className={`shrink-0 fill-current ${active ? 'text-violet-500' : 'text-gray-400 dark:text-gray-500'}`} />
                          <span className="text-sm font-medium ml-3 grow truncate lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                            {m.label}
                            {isSoon && <span className="ml-2 text-xs text-gray-400">soon</span>}
                          </span>
                          {badgeCount > 0 && (
                            <span
                              className="shrink-0 ml-2 min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-violet-500 text-white text-xs font-semibold tabular-nums lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200"
                              aria-label={`${badgeCount} ${badgeCount === 1 ? 'item needs' : 'items need'} attention`}
                            >
                              {badgeCount > 99 ? '99+' : badgeCount}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
