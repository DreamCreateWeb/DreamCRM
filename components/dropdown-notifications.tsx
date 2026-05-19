'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Menu, MenuButton, MenuItems, MenuItem, Transition } from '@headlessui/react'

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
 * Header bell. Polls /api/notifications every 30s for the unread count and
 * the most recent items. Clicking an item marks it read and navigates to
 * the linked path (or stays put if there's no link).
 *
 * We poll instead of using server-sent events to keep the surface area tight
 * for v1; if real-time becomes important we can swap the polling loop for
 * an SSE/WS subscription without touching this component's render.
 */
const POLL_INTERVAL_MS = 30_000
const ICON_FOR_BUCKET: Record<string, string> = {
  comments: '💬',
  candidates: '🎯',
  offers: '📣',
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

  async function handleItemClick(item: NotificationItem) {
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

  return (
    <Menu as="div" className="relative inline-flex">
      {({ open }) => (
        <>
          <MenuButton
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
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-rose-500 text-[10px] font-semibold text-white rounded-full flex items-center justify-center border border-gray-100 dark:border-gray-900">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </MenuButton>
          <Transition
            as="div"
            className={`origin-top-right z-10 absolute top-full -mr-48 sm:mr-0 min-w-[22rem] max-w-[22rem] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 py-1.5 rounded-lg shadow-lg overflow-hidden mt-1 ${
              align === 'right' ? 'right-0' : 'left-0'
            }`}
            enter="transition ease-out duration-200 transform"
            enterFrom="opacity-0 -translate-y-2"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-out duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="flex items-center justify-between pt-1.5 pb-2 px-4">
              <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">
                Notifications {unread > 0 && <span className="text-rose-500 normal-case font-medium">({unread} new)</span>}
              </div>
              {unread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={loading}
                  className="text-[11px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
            </div>
            <MenuItems as="ul" className="focus:outline-hidden max-h-[60vh] overflow-y-auto">
              {items.length === 0 ? (
                <li className="px-4 py-8 text-center text-[12px] italic text-gray-400 dark:text-gray-500">
                  No notifications yet. We'll let you know when something happens.
                </li>
              ) : (
                items.map((n) => (
                  <MenuItem key={n.id} as="li" className="border-b border-gray-100 dark:border-gray-700/40 last:border-0">
                    {({ active }) => (
                      <button
                        type="button"
                        onClick={() => handleItemClick(n)}
                        className={`w-full text-left block py-2.5 px-4 ${active && 'bg-gray-50 dark:bg-gray-700/20'} ${n.readAt ? '' : 'bg-violet-50/40 dark:bg-violet-500/[0.06]'}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-base shrink-0 mt-0.5">{ICON_FOR_BUCKET[n.bucket] ?? '🔔'}</span>
                          <div className="min-w-0 grow">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{n.title}</span>
                              {!n.readAt && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />}
                            </div>
                            {n.body && (
                              <p className="text-[12px] text-gray-500 dark:text-gray-400 line-clamp-2">{n.body}</p>
                            )}
                            <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mt-1 tabular-nums">
                              {formatRelative(n.createdAt)}
                            </p>
                          </div>
                        </div>
                      </button>
                    )}
                  </MenuItem>
                ))
              )}
            </MenuItems>
            <div className="border-t border-gray-200 dark:border-gray-700/60 pt-1.5">
              <Link
                href="/settings/notifications"
                className="block px-4 py-1.5 text-[11px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-center"
              >
                Notification preferences →
              </Link>
            </div>
          </Transition>
        </>
      )}
    </Menu>
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
