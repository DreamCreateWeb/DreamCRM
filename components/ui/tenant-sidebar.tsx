'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppProvider } from '@/app/app-provider'
import { DreamCreateMark } from '@/components/brand/dream-create-logo'
import DropdownProfile from '@/components/dropdown-profile'
import { NavIcon } from './nav-icons'
import type { ModuleDef, TenantType } from '@/lib/modules/types'

interface TenantSidebarProps {
  modules: ModuleDef[]
  /** Display name of the current organization — shown in the org switcher. */
  orgName?: string
  /**
   * Short plan/role descriptor rendered as the pill under the org name
   * (e.g. "Pro plan", "Platform admin", "Patient portal").
   */
  badge?: string
  variant?: 'default' | 'v2'
  /** Drives the live unread-count badges (clinic tenants only). */
  tenantType?: TenantType
  /** Amber "Demo" pill in the org switcher; governs nothing else here. */
  isDemo?: boolean
}

/** Live "needs attention" counts shown as pills next to nav entries. */
interface NavBadgeCounts {
  messages: number
  leads: number
  shop: number
  followups: number
}

/** Maps a module id → which badge count drives its pill. */
const BADGE_FOR_MODULE: Record<string, keyof NavBadgeCounts> = {
  messages: 'messages',
  leads: 'leads',
  shop: 'shop',
  followups: 'followups',
}

const BADGE_POLL_MS = 60_000
const GROUP_STORAGE_PREFIX = 'dc.sidebar.group.'

// "Seen since" model for the leads/shop badges. Unlike Messages (a genuine
// unread count that drops as you read threads), Leads/Shop count standing
// backlog — so without this they'd show the same number forever, even after
// you've looked. Instead we treat them as "new since you last opened this
// module": visiting /leads or /shop stamps a per-org timestamp, the API only
// counts items newer than it, and the badge clears the instant you look —
// then ticks back up as fresh items arrive. The full backlog still lives
// inside each module (status chips, rot borders), so nothing is hidden.
const SEEN_BADGE_PATHS: { prefix: string; key: 'leads' | 'shop' }[] = [
  { prefix: '/leads', key: 'leads' },
  { prefix: '/shop', key: 'shop' },
]

function seenStorageKey(orgName?: string) {
  return `dc.navseen.${orgName ?? 'org'}`
}
function readSeen(orgName?: string): Partial<Record<'leads' | 'shop', number>> {
  try {
    return JSON.parse(window.localStorage.getItem(seenStorageKey(orgName)) ?? '{}')
  } catch {
    return {}
  }
}
function writeSeen(orgName: string | undefined, key: 'leads' | 'shop', at: number) {
  try {
    const cur = readSeen(orgName)
    cur[key] = at
    window.localStorage.setItem(seenStorageKey(orgName), JSON.stringify(cur))
  } catch {
    /* ignore — a badge nudge is non-critical */
  }
}

/**
 * v2 data-driven sidebar (DESIGN-SYSTEM.md Part 4). Three states:
 *   - expanded 248px (default ≥xl)
 *   - icon rail 64px (default lg→xl; `[` toggles, persisted) — every icon
 *     carries a hover-flyout label + count, so nothing is unlabeled
 *   - overlay drawer (<lg; scrim + hamburger)
 *
 * Anatomy top→bottom: liquid-D mark + collapse caret · org-switcher block
 * (name + plan pill + chevron menu → plan/billing; amber Demo pill in demo
 * mode) · cockpit zone (label-less, pinned modules ⌘1/⌘2/⌘3) · collapsible
 * groups (headers stay) · bottom Settings slot + profile.
 *
 * Active = 2px teal left bar + teal-500/10 tint + teal icon + ink-bold label
 * (+ ambient breath). Badges are AMBER (warn semantics) — rail shows a dot,
 * the flyout shows the number. Live counts come from /api/nav-badges.
 */
export default function TenantSidebar({
  modules,
  orgName,
  badge,
  tenantType,
  isDemo = false,
}: TenantSidebarProps) {
  const sidebar = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const { sidebarOpen, setSidebarOpen, railCollapsed, toggleRail } = useAppProvider()
  const [badges, setBadges] = useState<NavBadgeCounts>({ messages: 0, leads: 0, shop: 0, followups: 0 })
  const [orgMenuOpen, setOrgMenuOpen] = useState(false)

  // Live unread-count pills (Messages / Leads / Shop). Clinic tenants only —
  // platform + patient sidebars don't surface those entries. Polls on an
  // interval + on window focus (mirrors the header bell), and stays resilient:
  // any fetch error silently keeps the previous counts rather than blanking.
  const isClinic = tenantType === 'clinic'
  const refreshBadges = useCallback(async () => {
    if (!isClinic) return
    try {
      // Send the leads/shop "last seen" stamps so the server returns counts of
      // only what's arrived since — Messages stays a true unread count.
      const seen = readSeen(orgName)
      const qs = new URLSearchParams()
      if (seen.leads) qs.set('leadsSince', String(seen.leads))
      if (seen.shop) qs.set('shopSince', String(seen.shop))
      const res = await fetch(`/api/nav-badges${qs.size ? `?${qs}` : ''}`, { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as Partial<NavBadgeCounts>
      setBadges({
        messages: Number(json.messages ?? 0),
        leads: Number(json.leads ?? 0),
        shop: Number(json.shop ?? 0),
        followups: Number(json.followups ?? 0),
      })
    } catch {
      // Swallow — keep prior counts; next tick retries.
    }
  }, [isClinic, orgName])

  useEffect(() => {
    if (!isClinic) return
    refreshBadges()
    const id = setInterval(refreshBadges, BADGE_POLL_MS)
    const onFocus = () => refreshBadges()
    // Surfaces that mutate a counted backlog (e.g. opening a patient thread →
    // marked read) dispatch this so the badge drops immediately, not on the
    // next 60s poll.
    const onRefresh = () => refreshBadges()
    window.addEventListener('focus', onFocus)
    window.addEventListener('nav-badges:refresh', onRefresh)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('nav-badges:refresh', onRefresh)
    }
  }, [isClinic, refreshBadges])

  // Opening a leads/shop module stamps it "seen now" → its badge clears at
  // once (optimistic) and the next fetch agrees. Any navigation also refreshes
  // the unread Messages count promptly.
  useEffect(() => {
    if (!isClinic) return
    const hit = SEEN_BADGE_PATHS.find(
      (s) => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`),
    )
    if (hit) {
      writeSeen(orgName, hit.key, Date.now())
      setBadges((b) => ({ ...b, [hit.key]: 0 }))
    }
    refreshBadges()
  }, [pathname, isClinic, orgName, refreshBadges])

  // Close the mobile drawer on click outside.
  useEffect(() => {
    const handler = ({ target }: { target: EventTarget | null }) => {
      if (!sidebar.current) return
      if (!sidebarOpen || sidebar.current.contains(target as Node)) return
      setSidebarOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  })

  // Close the mobile drawer on Escape.
  useEffect(() => {
    const handler = ({ keyCode }: { keyCode: number }) => {
      if (!sidebarOpen || keyCode !== 27) return
      setSidebarOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  })

  // Split the registry: pinned → cockpit; everything else → groups; the
  // Settings module → the bottom pinned slot (not inside a group).
  const pinned = modules.filter((m) => m.pinned)
  const settingsModule = modules.find((m) => m.id === 'settings')
  const grouped = modules.filter((m) => m.id !== 'settings')

  // Group the non-settings modules by section, preserving order.
  const sections = new Map<string, ModuleDef[]>()
  for (const m of grouped) {
    const key = m.section ?? 'Pages'
    if (!sections.has(key)) sections.set(key, [])
    sections.get(key)!.push(m)
  }

  function isActive(path: string) {
    if (path === '/') return pathname === '/'
    return pathname === path || pathname.startsWith(`${path}/`)
  }

  function badgeCountFor(m: ModuleDef) {
    const key = BADGE_FOR_MODULE[m.id]
    return key ? badges[key] : 0
  }

  // Rail = collapsed AND a real ≥lg layout. Below lg the drawer is always
  // full-width (w-64), so the rail treatment only matters at lg+. Rail = 64px
  // (w-16) per DESIGN-SYSTEM Part 4; expanded = 256px (w-64, the ~248px slot).
  const railClass = railCollapsed ? 'lg:w-16' : 'lg:w-64'

  return (
    <div className="min-w-fit">
      {/* Mobile scrim */}
      <div
        className={`fixed inset-0 bg-ink-900/30 z-40 lg:hidden lg:z-auto transition-opacity duration-200 ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      <aside
        id="sidebar"
        ref={sidebar}
        aria-label="Primary navigation"
        className={`aura-chrome grain flex lg:flex! flex-col absolute z-40 left-0 top-0 lg:static lg:left-auto lg:top-auto lg:translate-x-0 h-[100dvh] overflow-y-auto overflow-x-hidden no-scrollbar w-64 ${railClass} shrink-0 bg-surface-1 border-r border-hairline px-3 py-4 transition-[width,transform] duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-64 lg:translate-x-0'
        }`}
      >
        {/* 1 — Logo + collapse caret. In the 64px rail the two can't sit
            side-by-side (they'd overflow → horizontal scroll + the caret gets
            pushed off the clipped edge, making it miss the first click), so at
            lg+ rail they stack and center. */}
        <div
          className={`relative z-10 mb-3 px-1 flex items-center justify-between ${
            railCollapsed ? 'lg:flex-col lg:items-center lg:justify-center lg:gap-2' : ''
          }`}
        >
          <Link href="/" aria-label="Dream Create — home" className="block shrink-0">
            <DreamCreateMark size={30} />
          </Link>
          {/* Collapse caret — ≥lg only (the `[` key does the same thing). */}
          <button
            type="button"
            onClick={toggleRail}
            className="hidden lg:inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:text-ink-600 hover:bg-ink-900/[0.04] transition"
            title={railCollapsed ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}
            aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={railCollapsed}
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16" aria-hidden="true">
              {railCollapsed ? (
                <path d="M5.7 3.3 4.3 4.7 7.6 8l-3.3 3.3 1.4 1.4L10.4 8z" />
              ) : (
                <path d="M10.3 3.3 11.7 4.7 8.4 8l3.3 3.3-1.4 1.4L5.6 8z" />
              )}
            </svg>
          </button>
          {/* Close button — mobile drawer only. */}
          <button
            type="button"
            className="lg:hidden text-ink-500 hover:text-ink-600"
            onClick={() => setSidebarOpen(false)}
            aria-controls="sidebar"
            aria-label="Close sidebar"
          >
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10.7 18.7l1.4-1.4L7.8 13H20v-2H7.8l4.3-4.3-1.4-1.4L4 12z" />
            </svg>
          </button>
        </div>

        {/* 2 — Org switcher */}
        <OrgSwitcher
          orgName={orgName}
          badge={badge}
          isDemo={isDemo}
          isClinic={isClinic}
          rail={railCollapsed}
          open={orgMenuOpen}
          setOpen={setOrgMenuOpen}
        />

        {/* 3 — Cockpit zone (label-less, inset) */}
        {pinned.length > 0 && (
          <div className="relative z-10 mb-4 rounded-lg bg-surface-sunk/70 p-1.5" data-testid="cockpit">
            <ul className="space-y-0.5">
              {pinned.map((m) => (
                <NavItem
                  key={`pin-${m.id}`}
                  m={m}
                  active={isActive(m.path)}
                  rail={railCollapsed}
                  count={badgeCountFor(m)}
                  onNavigate={() => setSidebarOpen(false)}
                  showShortcut
                />
              ))}
            </ul>
          </div>
        )}

        {/* 4 — Groups (collapsible; headers stay) */}
        <nav className="relative z-10 grow space-y-5">
          {Array.from(sections.entries()).map(([section, items]) => (
            <NavGroup
              key={section}
              section={section}
              items={items}
              rail={railCollapsed}
              isActive={isActive}
              badgeCountFor={badgeCountFor}
              onNavigate={() => setSidebarOpen(false)}
            />
          ))}
        </nav>

        {/* 5 — Bottom: Settings pinned slot + profile */}
        <div className="relative z-10 mt-4 pt-3 border-t border-hairline space-y-1">
          {settingsModule && (
            <ul>
              <NavItem
                m={settingsModule}
                active={isActive(settingsModule.path)}
                rail={railCollapsed}
                count={0}
                onNavigate={() => setSidebarOpen(false)}
              />
            </ul>
          )}
          <div className={`px-1 pt-1 min-w-0 ${railCollapsed ? 'lg:flex lg:justify-center' : ''}`}>
            <DropdownProfile align="left" collapsed={railCollapsed} />
          </div>
        </div>
      </aside>
    </div>
  )
}

/* ── Org switcher ──────────────────────────────────────────────────────── */

function OrgSwitcher({
  orgName,
  badge,
  isDemo,
  isClinic,
  rail,
  open,
  setOpen,
}: {
  orgName?: string
  badge?: string
  isDemo: boolean
  isClinic: boolean
  rail: boolean
  open: boolean
  setOpen: (v: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open, setOpen])

  // The chevron menu (plan + billing) is clinic-only — platform/patient have
  // no plan to manage, so the block degrades to a static label there.
  const hasMenu = isClinic
  const initial = (orgName ?? 'D').trim().charAt(0).toUpperCase()

  return (
    <div ref={ref} className="relative z-20 mb-4 px-0.5" data-testid="org-switcher">
      <button
        type="button"
        onClick={() => hasMenu && setOpen(!open)}
        aria-haspopup={hasMenu ? 'menu' : undefined}
        aria-expanded={hasMenu ? open : undefined}
        disabled={!hasMenu}
        title={orgName}
        className={`group flex w-full items-center gap-2 rounded-lg py-1.5 text-left transition ${
          rail ? 'lg:justify-center lg:px-0 px-2' : 'px-2'
        } ${hasMenu ? 'hover:bg-ink-900/[0.04] cursor-pointer' : 'cursor-default'}`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal-500/12 text-teal-700 dark:text-teal-300 text-xs font-bold">
          {initial}
        </span>
        {!rail && (
          <span className="min-w-0 grow lg:block">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-ink-900">{orgName}</span>
              {isDemo && (
                <span
                  className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300"
                  title="You're viewing a demo workspace"
                >
                  Demo
                </span>
              )}
            </span>
            {badge && (
              <span className="block truncate text-xs font-medium text-ink-500">{badge}</span>
            )}
          </span>
        )}
        {hasMenu && !rail && (
          <svg className="ml-auto h-3.5 w-3.5 shrink-0 fill-current text-ink-400" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M5.9 8.4 1.5 4l1-1L6 6.4 9.5 3l1 1z" />
          </svg>
        )}
      </button>

      {hasMenu && open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg bg-surface-2 p-1 shadow-[var(--shadow-pop)]"
        >
          <Link
            href="/settings/clinic"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-1.5 text-sm font-semibold text-ink-800 hover:bg-ink-900/[0.04]"
          >
            Clinic settings
          </Link>
          <div className="my-1 border-t border-hairline" />
          <Link
            href="/settings/billing"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-900/[0.04]"
          >
            Plan &amp; billing
          </Link>
        </div>
      )}
    </div>
  )
}

/* ── Collapsible group ─────────────────────────────────────────────────── */

function NavGroup({
  section,
  items,
  rail,
  isActive,
  badgeCountFor,
  onNavigate,
}: {
  section: string
  items: ModuleDef[]
  rail: boolean
  isActive: (path: string) => boolean
  badgeCountFor: (m: ModuleDef) => number
  onNavigate: () => void
}) {
  const storageKey = `${GROUP_STORAGE_PREFIX}${section}`
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(storageKey) === '1')
    } catch {
      /* ignore */
    }
  }, [storageKey])

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(storageKey, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  // In the rail, group headers shrink to a centered hairline tick (the labels
  // live in each item's flyout), and the group never collapses — every icon
  // stays reachable.
  return (
    <div>
      <h3 className="px-2">
        {rail ? (
          <span className="block h-px bg-hairline mx-2 my-2" aria-hidden="true" />
        ) : (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            className="flex w-full items-center justify-between py-1 text-xs font-semibold uppercase tracking-wider text-ink-500 hover:text-ink-600"
          >
            <span>{section}</span>
            <svg
              className={`h-3 w-3 fill-current text-ink-400 transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}
              viewBox="0 0 12 12"
              aria-hidden="true"
            >
              <path d="M5.9 8.4 1.5 4l1-1L6 6.4 9.5 3l1 1z" />
            </svg>
          </button>
        )}
      </h3>
      {(rail || !collapsed) && (
        <ul className="mt-1 space-y-0.5">
          {items.map((m) => (
            <NavItem
              key={m.id}
              m={m}
              active={isActive(m.path)}
              rail={rail}
              count={badgeCountFor(m)}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── Single nav item (shared by cockpit, groups, settings slot) ───────────── */

function NavItem({
  m,
  active,
  rail,
  count,
  onNavigate,
  showShortcut = false,
}: {
  m: ModuleDef
  active: boolean
  rail: boolean
  count: number
  onNavigate: () => void
  showShortcut?: boolean
}) {
  const isSoon = m.status === 'soon'
  const countLabel = count > 99 ? '99+' : String(count)
  const ariaCount = count > 0 ? `, ${count} ${count === 1 ? 'item needs' : 'items need'} attention` : ''

  // Rail-mode flyout label. It must escape the sidebar's `overflow-y-auto`
  // (and the aside's transform containing-block), so a CSS popout would be
  // clipped no matter the z-index — we portal it to <body> at a fixed point
  // computed from the item's rect. Hover opens after 200ms; focus opens at
  // once (keyboard + assistive tech).
  const liRef = useRef<HTMLLIElement>(null)
  const [flyout, setFlyout] = useState<{ top: number; left: number } | null>(null)
  const flyoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openFlyout = useCallback((delay: number) => {
    if (!rail) return
    if (flyoutTimer.current) clearTimeout(flyoutTimer.current)
    flyoutTimer.current = setTimeout(() => {
      const r = liRef.current?.getBoundingClientRect()
      if (r) setFlyout({ top: r.top + r.height / 2, left: r.right + 8 })
    }, delay)
  }, [rail])
  const closeFlyout = useCallback(() => {
    if (flyoutTimer.current) clearTimeout(flyoutTimer.current)
    setFlyout(null)
  }, [])
  useEffect(() => {
    // Rail toggled off (or unmount) → drop any open flyout + pending timer.
    if (!rail) closeFlyout()
    return () => {
      if (flyoutTimer.current) clearTimeout(flyoutTimer.current)
    }
  }, [rail, closeFlyout])

  return (
    <li
      ref={liRef}
      className="group/navitem relative"
      onMouseEnter={() => openFlyout(200)}
      onMouseLeave={closeFlyout}
    >
      <Link
        href={isSoon ? '#' : m.path}
        onClick={onNavigate}
        onFocus={() => openFlyout(0)}
        onBlur={closeFlyout}
        aria-disabled={isSoon}
        aria-current={active ? 'page' : undefined}
        aria-label={rail ? `${m.label}${ariaCount}` : undefined}
        title={rail ? undefined : isSoon ? `${m.label} — coming soon` : undefined}
        className={`relative flex items-center rounded-md py-2 pl-3 pr-2 transition-colors ${
          rail ? 'lg:justify-center lg:px-0' : ''
        } ${
          active
            ? 'breath bg-teal-500/10 text-ink-900 font-semibold'
            : 'text-ink-600 hover:bg-ink-900/[0.04] hover:text-ink-900'
        } ${isSoon ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {/* Active 2px teal left bar */}
        {active && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-teal-500" aria-hidden="true" />
        )}
        <NavIcon
          name={m.icon}
          className={`shrink-0 fill-current ${active ? 'text-teal-600 dark:text-teal-400' : 'text-ink-400'}`}
        />
        {/* Inline label — expanded mode only. */}
        {!rail && (
          <>
            <span className="ml-3 grow truncate text-sm">
              {m.label}
              {isSoon && <span className="ml-2 text-xs text-ink-400">soon</span>}
            </span>
            {showShortcut && m.shortcut && (
              <kbd className="ml-2 shrink-0 rounded border border-hairline px-1 py-px text-xs font-medium tabular-nums text-ink-400">
                {m.shortcut}
              </kbd>
            )}
            {count > 0 && (
              <span
                className="ml-2 inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold tabular-nums text-white"
                aria-label={`${count} ${count === 1 ? 'item needs' : 'items need'} attention`}
              >
                {countLabel}
              </span>
            )}
          </>
        )}
        {/* Rail mode: a small amber dot signals "has a count". */}
        {rail && count > 0 && (
          <span
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-surface-1"
            aria-hidden="true"
          />
        )}
      </Link>

      {/* Rail-mode flyout: portaled to <body> so the sidebar's overflow/transform
          can't clip it; fixed at the item's right edge. Opens on hover/focus. */}
      {rail &&
        flyout &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            role="tooltip"
            data-testid="nav-flyout"
            style={{ position: 'fixed', top: flyout.top, left: flyout.left, transform: 'translateY(-50%)', zIndex: 200 }}
            className="pointer-events-none flex items-center gap-2 whitespace-nowrap rounded-md bg-surface-2 px-2.5 py-1.5 text-sm font-medium text-ink-800 shadow-[var(--shadow-pop)]"
          >
            <span>{m.label}</span>
            {m.shortcut && showShortcut && (
              <kbd className="rounded border border-hairline px-1 py-px text-xs font-medium tabular-nums text-ink-400">
                {m.shortcut}
              </kbd>
            )}
            {count > 0 && (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold tabular-nums text-white">
                {countLabel}
              </span>
            )}
          </span>,
          document.body,
        )}
    </li>
  )
}
