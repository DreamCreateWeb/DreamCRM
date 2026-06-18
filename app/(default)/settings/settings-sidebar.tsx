'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

interface NavSection {
  title: string
  items: NavItem[]
}

interface Props {
  /** Tenant type drives the org surface (clinic vs platform). Patient tenants
   *  don't see the settings sidebar at all (different route group). */
  tenantType?: 'platform' | 'clinic' | 'patient' | 'partner'
}

// ── Icon glyphs (inline so we don't import the whole nav-icons set) ──

const userIcon = (
  <path d="M8 9a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-5.143 7.91a1 1 0 1 1-1.714-1.033A7.996 7.996 0 0 1 8 10a7.996 7.996 0 0 1 6.857 3.877 1 1 0 1 1-1.714 1.032A5.996 5.996 0 0 0 8 12a5.996 5.996 0 0 0-5.143 2.91Z" />
)
const bellIcon = (
  <path d="m9 12.614 4.806 1.374a.15.15 0 0 0 .174-.21L8.133 2.082a.15.15 0 0 0-.268 0L2.02 13.777a.149.149 0 0 0 .174.21L7 12.614V9a1 1 0 1 1 2 0v3.614Zm-1 1.794-5.257 1.503c-1.798.514-3.35-1.355-2.513-3.028L6.076 1.188c.791-1.584 3.052-1.584 3.845 0l5.848 11.695c.836 1.672-.714 3.54-2.512 3.028L8 14.408Z" />
)
const shieldIcon = (
  <path d="M8 0a4 4 0 0 0-4 4v3H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1V4a4 4 0 0 0-4-4Zm2 7H6V4a2 2 0 0 1 4 0v3ZM4 9h8v5H4V9Z" />
)
const buildingIcon = (
  <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm0 14A6 6 0 1 1 8 2a6 6 0 0 1 0 12Zm0-10a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
)
const pinIcon = (
  <path d="M8 0a5 5 0 0 0-5 5c0 4 5 11 5 11s5-7 5-11a5 5 0 0 0-5-5Zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
)
const teamIcon = (
  <path d="M5 4a3 3 0 1 1 6 0 3 3 0 0 1-6 0Zm3 5a5 5 0 0 0-5 5 1 1 0 1 1-2 0 7 7 0 0 1 14 0 1 1 0 1 1-2 0 5 5 0 0 0-5-5Z" />
)
const plugIcon = (
  <path d="M8 3.414V6a1 1 0 1 1-2 0V1a1 1 0 0 1 1-1h5a1 1 0 0 1 0 2H9.414l6.293 6.293a1 1 0 1 1-1.414 1.414L8 3.414Zm0 9.172V10a1 1 0 1 1 2 0v5a1 1 0 0 1-1 1H4a1 1 0 0 1 0-2h2.586L.293 7.707a1 1 0 0 1 1.414-1.414L8 12.586Z" />
)
const stackIcon = (
  <path d="M5 9a1 1 0 1 1 0-2h6a1 1 0 0 1 0 2H5ZM1 4a1 1 0 1 1 0-2h14a1 1 0 0 1 0 2H1Zm0 10a1 1 0 0 1 0-2h14a1 1 0 0 1 0 2H1Z" />
)
const cardIcon = (
  <path d="M0 4a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4Zm2 0v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Zm9 1a1 1 0 0 1 0 2H5a1 1 0 1 1 0-2h6Zm0 4a1 1 0 0 1 0 2H5a1 1 0 1 1 0-2h6Z" />
)
const heartIcon = (
  <path d="M14.3.3c.4-.4 1-.4 1.4 0 .4.4.4 1 0 1.4l-8 8c-.2.2-.4.3-.7.3-.3 0-.5-.1-.7-.3-.4-.4-.4-1 0-1.4l8-8zM15 7c.6 0 1 .4 1 1 0 4.4-3.6 8-8 8s-8-3.6-8-8 3.6-8 8-8c.6 0 1 .4 1 1s-.4 1-1 1C4.7 2 2 4.7 2 8s2.7 6 6 6 6-2.7 6-6c0-.6.4-1 1-1z" />
)
const searchIcon = (
  <path d="M7 14a7 7 0 1 1 4.94-2.06l3.56 3.56a1 1 0 0 1-1.42 1.42l-3.56-3.56A6.97 6.97 0 0 1 7 14Zm0-2a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
)
const calendarIcon = (
  <path d="M4 0a1 1 0 0 1 1 1v1h6V1a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h1V1a1 1 0 0 1 1-1Zm10 6H2v8h12V6Z" />
)

// ── The two settings SURFACES ───────────────────────────────────────────
//
// Settings split into two distinct surfaces with two entry points:
//   • USER settings   — personal account (avatar menu → "Account settings").
//                       Account · Notifications · Security. Just you.
//   • ORG settings    — everything that affects the whole clinic/platform
//                       (org-switcher → "Clinic settings"). Visible to ANY
//                       staff member; edits stay owner/admin-gated per page.
//
// The sidebar picks the surface from the current path so each entry point
// lands on the right, focused list (no more one giant mixed menu).

const USER_PATHS = ['/settings/account', '/settings/notifications', '/settings/security']

function userSections(): NavSection[] {
  return [
    {
      title: 'Account',
      items: [
        { href: '/settings/account', label: 'Profile', icon: userIcon },
        { href: '/settings/notifications', label: 'Notifications', icon: bellIcon },
        { href: '/settings/security', label: 'Security', icon: shieldIcon },
      ],
    },
  ]
}

function clinicSections(): NavSection[] {
  return [
    {
      title: 'Clinic',
      items: [
        { href: '/settings/clinic', label: 'Clinic profile', icon: buildingIcon },
        { href: '/settings/locations', label: 'Locations', icon: pinIcon },
        { href: '/settings/team', label: 'Team', icon: teamIcon },
        { href: '/settings/apps', label: 'Connected accounts', icon: plugIcon },
      ],
    },
    {
      title: 'Scheduling & patients',
      items: [
        { href: '/settings/practice', label: 'Practice setup', icon: calendarIcon },
        { href: '/settings/portal', label: 'Patient portal', icon: heartIcon },
        { href: '/settings/reminders', label: 'Reminders', icon: bellIcon },
      ],
    },
    {
      title: 'Website',
      items: [
        { href: '/settings/seo', label: 'Search appearance', icon: searchIcon },
      ],
    },
    {
      title: 'Billing',
      items: [
        { href: '/settings/plans', label: 'Plan & usage', icon: stackIcon },
        { href: '/settings/billing', label: 'Billing', icon: cardIcon },
      ],
    },
    {
      title: 'Help',
      items: [
        { href: '/settings/feedback', label: 'Send feedback', icon: heartIcon },
      ],
    },
  ]
}

function platformSections(): NavSection[] {
  return [
    {
      title: 'Platform',
      items: [
        { href: '/settings/team', label: 'Team', icon: teamIcon },
        { href: '/settings/apps', label: 'Connected accounts', icon: plugIcon },
      ],
    },
    {
      title: 'Help',
      items: [
        { href: '/settings/feedback', label: 'Send feedback', icon: heartIcon },
      ],
    },
  ]
}

// Resizable width: a draggable divider lets users widen the nav (long labels)
// or reclaim space for the content. Persisted so it's consistent across pages.
const MIN_W = 200
const MAX_W = 380
const DEFAULT_W = 256
const WIDTH_KEY = 'dc.settingsSidebarWidth'

export default function SettingsSidebar({ tenantType }: Props = {}) {
  const pathname = usePathname()
  const isPlatform = tenantType === 'platform'
  // Which surface are we on? The 3 personal pages → user surface; everything
  // else under /settings → the org (clinic/platform) surface.
  const onUserSurface = USER_PATHS.some((p) => pathname.startsWith(p))

  const orgLabel = isPlatform ? 'Platform settings' : 'Clinic settings'
  const orgHome = isPlatform ? '/settings/team' : '/settings/clinic'

  const surfaceTitle = onUserSurface ? 'Your account' : orgLabel
  const surfaceHint = onUserSurface
    ? 'Just for you — sign-in, profile, alerts.'
    : isPlatform
      ? 'Settings for the whole platform.'
      : 'Affects your whole clinic. Visible to all staff.'
  const surfaceIcon = onUserSurface ? userIcon : buildingIcon

  const sections = onUserSurface
    ? userSections()
    : isPlatform
      ? platformSections()
      : clinicSections()

  // The cross-surface link in the footer (switch to the OTHER surface).
  const otherSurface = onUserSurface
    ? { label: orgLabel, href: orgHome }
    : { label: 'Your account', href: '/settings/account' }

  // ── Search / filter ──────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = q
    ? sections
        .map((s) => ({ ...s, items: s.items.filter((i) => i.label.toLowerCase().includes(q)) }))
        .filter((s) => s.items.length > 0)
    : sections
  const noResults = q.length > 0 && filtered.length === 0
  const searchRef = useRef<HTMLInputElement>(null)

  // ── Resize ───────────────────────────────────────────────────────────
  const [width, setWidth] = useState(DEFAULT_W)
  const dragRef = useRef<{ x: number; w: number } | null>(null)

  useEffect(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY))
    if (Number.isFinite(saved) && saved >= MIN_W && saved <= MAX_W) setWidth(saved)
  }, [])

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { x: e.clientX, w: width }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const next = Math.min(MAX_W, Math.max(MIN_W, dragRef.current.w + (ev.clientX - dragRef.current.x)))
      setWidth(next)
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setWidth((w) => {
        try { localStorage.setItem(WIDTH_KEY, String(w)) } catch { /* ignore */ }
        return w
      })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  const resetWidth = () => {
    setWidth(DEFAULT_W)
    try { localStorage.setItem(WIDTH_KEY, String(DEFAULT_W)) } catch { /* ignore */ }
  }

  // ── On navigation: clear any search (so clicking a result doesn't leave
  //    the nav filtered) and scroll the now-active item into view. The rail
  //    is in the settings layout, so it persists across pages — without this,
  //    a stale query would keep filtering the next page's nav. ─────────────
  const activeRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    setQuery('')
    const id = requestAnimationFrame(() => activeRef.current?.scrollIntoView({ block: 'nearest' }))
    return () => cancelAnimationFrame(id)
  }, [pathname])

  return (
    <div
      className="relative flex flex-col w-full md:w-[var(--sb-w)] md:shrink-0 md:sticky md:top-16 md:self-start md:max-h-[calc(100dvh-5rem)] pb-5 md:pb-0 md:pr-1 md:pt-1 border-b md:border-b-0 border-gray-200 dark:border-gray-700/60"
      style={{ ['--sb-w' as string]: `${width}px` }}
    >
      {/* Surface header — names which settings you're in (user vs clinic). */}
      <div className="px-1.5 mb-4 hidden md:block">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal-500/12 text-teal-700 dark:text-teal-300">
            <svg className="fill-current" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
              {surfaceIcon}
            </svg>
          </span>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{surfaceTitle}</span>
        </div>
        <p className="mt-1.5 text-xs leading-snug text-gray-500 dark:text-gray-400">{surfaceHint}</p>
      </div>

      {/* Search — filter this surface's settings. Desktop only (mobile uses the
          horizontal chip rail below). */}
      <div className="px-0.5 mb-3 hidden md:block">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 fill-current text-gray-400 dark:text-gray-500"
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            {searchIcon}
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Search settings…"
            aria-label="Search settings"
            className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 pl-8 pr-7 py-1.5 text-sm text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
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

      {/* Sections — horizontal chip rail on mobile, vertical scrollable list on
          desktop (so a tall nav scrolls inside the pinned sidebar). */}
      <div className="flex flex-nowrap overflow-x-scroll no-scrollbar md:block md:overflow-y-auto md:overflow-x-hidden md:space-y-4 grow md:min-h-0 md:-mr-1.5 md:pr-1.5">
        {filtered.map((section) => (
          <div key={section.title} className="md:mb-0">
            <div className="hidden md:block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              {section.title}
            </div>
            <ul className="flex flex-nowrap md:block mr-3 md:mr-0">
              {section.items.map((item) => {
                const active = pathname.startsWith(item.href)
                return (
                  <li key={item.href} className="mr-0.5 md:mr-0 md:mb-0.5">
                    {/* Active = main-sidebar v2 language: 2px teal left bar +
                        teal-500/10 tint + teal icon + ink-bold label. Teal here
                        is identity (selection), never a status. */}
                    <Link
                      href={item.href}
                      ref={active ? activeRef : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={`relative flex items-center px-2.5 py-2 rounded-[var(--r-sm)] whitespace-nowrap transition-colors ${
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
        ))}
        {noResults && (
          <p className="hidden md:block px-2.5 text-sm text-gray-500 dark:text-gray-400">
            No settings match “{query}”.
          </p>
        )}
      </div>

      {/* Footer — jump to the OTHER settings surface. */}
      <div className="hidden md:block mt-5 pt-4 border-t border-gray-200 dark:border-gray-700/60">
        <Link
          href={otherSurface.href}
          className="group flex items-center gap-1.5 px-1.5 text-xs font-medium text-gray-500 hover:text-teal-700 dark:text-gray-400 dark:hover:text-teal-300 transition-colors"
        >
          <svg className="h-3 w-3 fill-current" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6.7 2.3a1 1 0 0 1 0 1.4L4.4 6H14a1 1 0 1 1 0 2H4.4l2.3 2.3a1 1 0 1 1-1.4 1.4l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 1.4 0Z" />
          </svg>
          {otherSurface.label}
        </Link>
      </div>

      {/* Resize handle — drag to widen/narrow; double-click to reset. Desktop only. */}
      <button
        type="button"
        onMouseDown={startResize}
        onDoubleClick={resetWidth}
        aria-label="Resize settings sidebar"
        title="Drag to resize · double-click to reset"
        className="hidden md:block absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize bg-transparent hover:bg-teal-500/20 active:bg-teal-500/30 transition-colors"
      />
    </div>
  )
}
