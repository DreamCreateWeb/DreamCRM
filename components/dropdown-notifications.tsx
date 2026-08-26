'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Popover, PopoverButton, PopoverPanel, Transition } from '@headlessui/react'
import { useRealtime } from '@/components/realtime/realtime-provider'
import { notificationType, type NotificationTone } from '@/lib/types/notifications'

interface NotificationItem {
  id: number
  bucket: string
  type: string
  title: string
  body: string | null
  linkPath: string | null
  readAt: string | null
  createdAt: string
}

/**
 * Header bell. Refreshes the instant a notification lands — it subscribes to
 * the app-wide `notifications` realtime topic (RealtimeProvider → SSE →
 * Postgres NOTIFY) and refetches on each event. A slow interval remains as a
 * fallback for when the stream is mid-reconnect. Clicking an item marks it read
 * and navigates to the linked path.
 *
 * A POPOVER, not a Menu (2026-08-25, owner: "I can't click anything without
 * closing the tray"). The old headlessui <Menu> treated everything outside
 * its <MenuItems> list — the Mark-all-read header, the Clear-all/Preferences
 * footer — as OUTSIDE the menu, so the outside-click handler dismissed the
 * tray on mousedown before those buttons ever received their click. A
 * Popover's panel is one container: everything inside it is clickable, and
 * it closes only on Esc, a true outside click, or when a row/link calls
 * close() itself. Dismiss ✕, Mark all read, and Clear all deliberately KEEP
 * the tray open — you're tidying the tray, not leaving it.
 *
 * Rows wear their TYPE's face (2026-08-25 overhaul): icon + tone come from
 * the shared registry in lib/types/notifications, so a 1-star review, a
 * no-show and a paid order stop sharing one bucket emoji. Tone paints only
 * the icon tile — living-data law: color is a signal, not decoration, and
 * ten tinted rows would be noise.
 */
const POLL_INTERVAL_MS = 60_000

/** Icon-tile tint per tone. Quiet on purpose — the tile is the only tinted
 *  surface in a row, so a glance finds the urgent one without the tray
 *  turning into a paint chart. */
const TONE_TILE: Record<NotificationTone, string> = {
  urgent: 'bg-rose-500/10',
  warn: 'bg-amber-500/10',
  ok: 'bg-emerald-500/10',
  info: 'bg-violet-500/10',
  neutral: 'bg-gray-500/10 dark:bg-gray-400/10',
}

export default function DropdownNotifications({ align }: { align?: 'left' | 'right' }) {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=10', { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as { items: NotificationItem[]; unread: number }
      setItems(json.items)
      setUnread(json.unread)
    } catch {
      // Swallow — bell silently retries on the next tick
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

  // Live: a new notification for this user → refetch immediately (the bell
  // dings the moment something happens, not on the next poll).
  useRealtime('notifications', () => {
    refresh()
  })

  async function handleItemClick(item: NotificationItem, closePanel: () => void) {
    if (!item.readAt) {
      // Optimistic update
      setItems((rows) => rows.map((r) => (r.id === item.id ? { ...r, readAt: new Date().toISOString() } : r)))
      setUnread((n) => Math.max(0, n - 1))
      try {
        await fetch('/api/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [item.id] }),
        })
      } catch {
        /* ignore */
      }
    }
    closePanel()
    if (item.linkPath) router.push(item.linkPath)
  }

  async function handleMarkAllRead() {
    setLoading(true)
    setItems((rows) => rows.map((r) => (r.readAt ? r : { ...r, readAt: new Date().toISOString() })))
    setUnread(0)
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
    } finally {
      setLoading(false)
    }
  }

  // Per-item ✕. Stop propagation so the row's click (navigate + close menu)
  // never fires — dismissing one leaves the tray open to dismiss more.
  async function handleDismiss(item: NotificationItem, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setItems((rows) => rows.filter((r) => r.id !== item.id))
    if (!item.readAt) setUnread((n) => Math.max(0, n - 1))
    try {
      await fetch('/api/notifications/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [item.id] }),
      })
      // A dismissal may reveal the next item beyond the shown 10 — resync.
      refresh()
    } catch {
      /* ignore */
    }
  }

  async function handleClearAll() {
    setLoading(true)
    setItems([])
    setUnread(0)
    try {
      await fetch('/api/notifications/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Popover as="div" className="relative inline-flex">
      {({ open, close }) => (
        <>
          <PopoverButton
            className={`w-8 h-8 flex items-center justify-center hover:bg-gray-100 lg:hover:bg-gray-200 dark:hover:bg-gray-700/50 dark:lg:hover:bg-gray-800 rounded-full relative ${
              open && 'bg-gray-200 dark:bg-gray-800'
            }`}
          >
            <span className="sr-only">Notifications</span>
            <svg
              className="fill-current text-gray-500/80 dark:text-gray-400/80"
              width={16}
              height={16}
              viewBox="0 0 16 16"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M7 0a7 7 0 0 0-7 7c0 1.202.308 2.33.84 3.316l-.789 2.368a1 1 0 0 0 1.265 1.265l2.595-.865a1 1 0 0 0-.632-1.898l-.698.233.3-.9a1 1 0 0 0-.104-.85A4.97 4.97 0 0 1 2 7a5 5 0 0 1 5-5 4.99 4.99 0 0 1 4.093 2.135 1 1 0 1 0 1.638-1.148A6.99 6.99 0 0 0 7 0Z" />
              <path d="M11 6a5 5 0 0 0 0 10c.807 0 1.567-.194 2.24-.533l1.444.482a1 1 0 0 0 1.265-1.265l-.482-1.444A4.962 4.962 0 0 0 16 11a5 5 0 0 0-5-5Zm-3 5a3 3 0 0 1 6 0c0 .588-.171 1.134-.466 1.6a1 1 0 0 0-.115.82 1 1 0 0 0-.82.114A2.973 2.973 0 0 1 11 14a3 3 0 0 1-3-3Z" />
            </svg>
            {/* Unread is warn-semantics (something for US to act on) → AMBER,
                not the old rose. Per DESIGN-SYSTEM Part 1/Part 4. */}
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-amber-500 text-xs leading-none font-semibold text-white rounded-full flex items-center justify-center ring-2 ring-surface-1">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </PopoverButton>
          <Transition
            enter="transition ease-out duration-200 transform"
            enterFrom="opacity-0 -translate-y-2"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-out duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <PopoverPanel
              className={`origin-top-right z-10 absolute top-full -mr-48 sm:mr-0 min-w-[24rem] max-w-[24rem] bg-white dark:bg-gray-800 border border-[color:var(--color-hairline)] rounded-[var(--r-md)] shadow-[var(--shadow-pop)] overflow-hidden mt-1.5 ${
                align === 'right' ? 'right-0' : 'left-0'
              }`}
            >
            <div className="flex items-baseline justify-between px-4 pb-2 pt-3">
              <div className="text-sm font-bold tracking-tight text-gray-900 dark:text-gray-100">
                Notifications
                {unread > 0 && (
                  <span className="ml-1.5 font-mono-num text-xs font-semibold text-amber-600 tabular-nums dark:text-amber-400">
                    {unread} new
                  </span>
                )}
              </div>
              {unread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={loading}
                  className="text-xs font-medium text-teal-700 hover:text-teal-800 disabled:opacity-50 dark:text-teal-300 dark:hover:text-teal-200"
                >
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 ? (
                <li className="px-6 py-10 text-center">
                  <span
                    aria-hidden="true"
                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--color-surface-sunk)] text-xl"
                  >
                    💤
                  </span>
                  <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">All quiet</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    When something needs your eyes — a message, a booking, a review — it lands here.
                  </p>
                </li>
              ) : (
                items.map((n) => {
                  const def = notificationType(n.type)
                  return (
                    <li key={n.id} className="border-b border-gray-100 last:border-0 dark:border-gray-700/40">
                      <div className="relative group">
                        <button
                          type="button"
                          onClick={() => handleItemClick(n, close)}
                          className={`block w-full py-3 pl-4 pr-9 text-left hover:bg-gray-50 focus-visible:bg-gray-50 dark:hover:bg-gray-700/20 dark:focus-visible:bg-gray-700/20 ${n.readAt ? 'opacity-75' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              aria-hidden="true"
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${TONE_TILE[def.tone]}`}
                            >
                              {def.icon}
                            </span>
                            <div className="min-w-0 grow">
                              <div className="flex items-start gap-2">
                                <span className={`min-w-0 flex-1 text-sm leading-snug text-gray-800 dark:text-gray-100 ${n.readAt ? 'font-medium' : 'font-semibold'}`}>
                                  {n.title}
                                </span>
                                {!n.readAt && (
                                  <span
                                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500"
                                    aria-label="Unread"
                                  />
                                )}
                              </div>
                              {n.body && (
                                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{n.body}</p>
                              )}
                              <p className="mt-1 text-[11px] font-medium tabular-nums text-gray-400 dark:text-gray-500">
                                {formatRelative(n.createdAt)}
                              </p>
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDismiss(n, e)}
                          aria-label="Dismiss notification"
                          title="Dismiss"
                          className="absolute right-2 top-2.5 flex h-5 w-5 items-center justify-center rounded text-gray-400 opacity-0 transition-opacity hover:bg-gray-200/70 hover:text-gray-700 focus:opacity-100 group-hover:opacity-100 dark:text-gray-500 dark:hover:bg-gray-600/50 dark:hover:text-gray-200"
                        >
                          <svg width="9" height="9" viewBox="0 0 9 9" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path
                              d="M1 1l7 7M8 1l-7 7"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              fill="none"
                            />
                          </svg>
                        </button>
                      </div>
                    </li>
                  )
                })
              )}
            </ul>
            <div className="flex items-center justify-between border-t border-[color:var(--color-hairline)] bg-[color:var(--color-surface-sunk)] px-4 py-2">
              {items.length > 0 ? (
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={loading}
                  className="text-xs font-medium text-gray-500 hover:text-rose-600 disabled:opacity-50 dark:text-gray-400 dark:hover:text-rose-400"
                >
                  Clear all
                </button>
              ) : (
                <span />
              )}
              <Link
                href="/settings/notifications"
                onClick={() => close()}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Preferences →
              </Link>
            </div>
            </PopoverPanel>
          </Transition>
        </>
      )}
    </Popover>
  )
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(iso).toLocaleDateString()
}
