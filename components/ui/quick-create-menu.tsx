'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * `+ New ▾` header quick-create (DESIGN-SYSTEM.md Part 4). A context-aware
 * split control: on a page that owns one of the create targets, the main
 * click goes straight there (New booking on /appointments, New patient on
 * /patients); everywhere else the main click opens the menu. The `C` key
 * (wired in KeyboardShortcuts) opens the menu from anywhere.
 *
 * Entries are plan-gated by the caller via `moduleIds` — the set of module
 * ids visible to this tenant (server-resolved through getVisibleModules), so
 * the menu can never offer a surface the plan/role doesn't include. Only
 * targets that have a real in-app create path are listed (no dead links):
 * Booking + Patient open their create UI via `?new=1`; Campaign + Post land
 * on the page whose primary action creates one. "Lead" is intentionally
 * absent — leads are captured from the public contact form, with no in-app
 * create flow to link to.
 */

interface QuickCreateEntry {
  /** Module id that gates this entry (must be in `moduleIds` to show). */
  module: string
  label: string
  href: string
  /** True when this is the contextual default for the current page. */
  matchPath?: string
}

const ENTRIES: QuickCreateEntry[] = [
  { module: 'appointments', label: 'New booking', href: '/appointments?new=1', matchPath: '/appointments' },
  { module: 'patients', label: 'New patient', href: '/patients?new=1', matchPath: '/patients' },
  { module: 'recall', label: 'New campaign', href: '/marketing/campaigns' },
  { module: 'blog', label: 'New post', href: '/posts' },
]

export default function QuickCreateMenu({ moduleIds }: { moduleIds: string[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const allowed = new Set(moduleIds)
  const entries = ENTRIES.filter((e) => allowed.has(e.module))

  // Context default: the entry whose page we're on (deepest match wins).
  const contextual = entries
    .filter((e) => e.matchPath && (pathname === e.matchPath || pathname.startsWith(`${e.matchPath}/`)))
    .sort((a, b) => (b.matchPath?.length ?? 0) - (a.matchPath?.length ?? 0))[0]

  // `C` opens the menu (ignored in inputs — handled by KeyboardShortcuts,
  // which dispatches this event). We listen for a custom event so the global
  // key map stays the single source of truth for "is focus in a field".
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('dc:quick-create', onOpen)
    return () => window.removeEventListener('dc:quick-create', onOpen)
  }, [])

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Nothing to create for this tenant (e.g. platform admin) → render nothing.
  if (entries.length === 0) return null

  return (
    <div ref={ref} className="relative" data-testid="quick-create">
      {contextual ? (
        // Split control: primary navigates to the contextual create; the
        // caret opens the full menu.
        <div className="inline-flex items-stretch overflow-hidden rounded-md">
          <Link
            href={contextual.href}
            className="inline-flex h-8 items-center gap-1 bg-teal-500 px-2.5 text-sm font-medium text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300"
            title={`${contextual.label} (C for menu)`}
          >
            <Plus />
            <span className="hidden sm:inline">{contextual.label}</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="More create options"
            className="inline-flex h-8 w-7 items-center justify-center border-l border-white/25 bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300"
          >
            <Caret />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-teal-500 px-2.5 text-sm font-medium text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300"
          title="Create something new (C)"
        >
          <Plus />
          <span className="hidden sm:inline">New</span>
          <Caret />
        </button>
      )}

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[12rem] rounded-lg bg-surface-2 p-1 shadow-[var(--shadow-pop)]"
        >
          {entries.map((e) => (
            <Link
              key={e.module}
              href={e.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-900/[0.04]"
            >
              {e.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function Plus() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 fill-current" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M9 7V2H7v5H2v2h5v5h2V9h5V7z" />
    </svg>
  )
}

function Caret() {
  return (
    <svg className="h-3 w-3 shrink-0 fill-current opacity-80" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M5.9 8.4 1.5 4l1-1L6 6.4 9.5 3l1 1z" />
    </svg>
  )
}
