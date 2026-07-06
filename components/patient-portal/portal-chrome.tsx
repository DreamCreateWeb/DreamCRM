'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useState } from 'react'
import { useFocusTrap } from '@/components/ui/use-focus-trap'
import type { PortalNavItem, PortalIconName } from './nav'

/**
 * Client chrome for the patient portal: desktop header nav + mobile bottom
 * tab bar + the "More" sheet. Pure presentation — the nav items arrive
 * already filtered by the clinic's portal settings.
 *
 * Visual language matches the clinic public site (warm neutrals, clinic
 * brand accent, generous radii), NOT the Mosaic admin dashboard.
 */

const STROKE: Record<PortalIconName, React.ReactNode> = {
  home: (
    <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1H10v-5a2 2 0 0 1 4 0v5h3.5a1 1 0 0 0 1-1V9.5" />
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17M8 2.5V7m8-4.5V7" />
    </>
  ),
  chat: (
    <path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12Z" />
  ),
  card: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M2.5 10h19M6 15h4" />
    </>
  ),
  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  ),
  doc: (
    <>
      <path d="M6 3.5h8L19 8.5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V5A1.5 1.5 0 0 1 6.5 3.5Z" />
      <path d="M9 12.5h6M9 16h6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5a3.5 3.5 0 0 1 0 6.5M21.5 20a6.5 6.5 0 0 0-4.5-6" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12a1.5 1.5 0 0 1-1.5 1.3h-9A1.5 1.5 0 0 1 6 20L5 8Z" />
      <path d="M9 10.5V6a3 3 0 0 1 6 0v4.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
}

export function PortalIcon({
  name,
  className,
}: {
  name: PortalIconName
  className?: string
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {STROKE[name]}
    </svg>
  )
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

/** Desktop header nav — pill links, brand-colored when active. */
export function PortalDesktopNav({
  items,
  brand,
}: {
  items: PortalNavItem[]
  brand: string
}) {
  const pathname = usePathname()
  return (
    <nav className="hidden md:flex items-center gap-1" aria-label="Portal">
      {items.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className="px-3.5 py-2 rounded-full text-[0.92rem] font-medium transition-colors"
            style={
              active
                ? { backgroundColor: brand, color: '#FFFFFF' }
                : { color: '#6B635A' }
            }
          >
            {item.label}
            {!!item.badge && (
              <span
                aria-label={`${item.badge} unread`}
                className="ml-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full px-1 text-[0.68rem] font-bold leading-[1.15rem] align-middle"
                style={active ? { backgroundColor: '#FFFFFF', color: brand } : { backgroundColor: brand, color: '#FFFFFF' }}
              >
                {item.badge > 9 ? '9+' : item.badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Mobile bottom tab bar: up to 4 primary destinations + More. One-thumb
 * reach, 44px+ targets, safe-area padding for home-indicator phones.
 */
export function PortalTabBar({
  primary,
  more,
  brand,
}: {
  primary: PortalNavItem[]
  more: PortalNavItem[]
  brand: string
}) {
  const pathname = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  useFocusTrap(sheetOpen, sheetRef, { onEscape: () => setSheetOpen(false) })
  const moreActive = more.some((m) => isActive(pathname, m.href))

  return (
    <>
      {sheetOpen && (
        <div ref={sheetRef} className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/30"
            onClick={() => setSheetOpen(false)}
          />
          <div
            className="absolute bottom-0 inset-x-0 rounded-t-3xl bg-white p-4 pb-24 shadow-2xl"
            style={{ borderTop: '1px solid #E8E2D9' }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#E8E2D9]" />
            <ul className="grid grid-cols-1 gap-1">
              {more.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setSheetOpen(false)}
                      className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-[0.95rem] font-medium"
                      style={active ? { backgroundColor: '#FAF7F2', color: brand } : { color: '#1C1A17' }}
                    >
                      <PortalIcon name={item.icon} className="h-5 w-5" />
                      {item.label}
                      {!!item.badge && (
                        <span
                          aria-label={`${item.badge} unread`}
                          className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[0.7rem] font-bold leading-[1.25rem] text-white"
                          style={{ backgroundColor: brand }}
                        >
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 inset-x-0 z-30 md:hidden bg-white/95 backdrop-blur"
        style={{ borderTop: '1px solid #E8E2D9', paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Portal"
      >
        <ul className="flex items-stretch justify-around">
          {primary.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-1.5"
                  style={{ color: active ? brand : '#8A8178' }}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="relative">
                    <PortalIcon name={item.icon} className="h-[22px] w-[22px]" />
                    {!!item.badge && (
                      <span
                        aria-label={`${item.badge} unread`}
                        className="absolute -right-2 -top-1 inline-flex min-w-[1rem] items-center justify-center rounded-full px-1 text-[0.6rem] font-bold leading-4 text-white"
                        style={{ backgroundColor: brand }}
                      >
                        {item.badge > 9 ? '9+' : item.badge}
                      </span>
                    )}
                  </span>
                  <span className="text-[0.68rem] font-semibold">{item.label}</span>
                </Link>
              </li>
            )
          })}
          {more.length > 0 && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setSheetOpen((v) => !v)}
                className="flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 py-1.5"
                style={{ color: moreActive ? brand : '#8A8178' }}
              >
                <PortalIcon name="dots" className="h-[22px] w-[22px]" />
                <span className="text-[0.68rem] font-semibold">More</span>
              </button>
            </li>
          )}
        </ul>
      </nav>
    </>
  )
}

/**
 * Clinic announcement strip — dismissible, remembered per-message so a new
 * announcement resurfaces after an old one was dismissed.
 */
export function PortalAnnouncement({ text, brand }: { text: string; brand: string }) {
  const storageKey = 'portal_announcement_dismissed'
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(storageKey) === text
    } catch {
      return false
    }
  })
  if (dismissed) return null
  return (
    <div
      className="relative px-4 py-2.5 text-center text-[0.85rem] font-medium text-white"
      style={{ backgroundColor: brand }}
    >
      <span className="pr-8">{text}</span>
      <button
        type="button"
        aria-label="Dismiss announcement"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-white/80 hover:text-white"
        onClick={() => {
          setDismissed(true)
          try {
            window.localStorage.setItem(storageKey, text)
          } catch {
            // private mode — dismiss for this render only
          }
        }}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <path d="M4.3 3.3a.7.7 0 0 0-1 1L7 8l-3.7 3.7a.7.7 0 1 0 1 1L8 9l3.7 3.7a.7.7 0 1 0 1-1L9 8l3.7-3.7a.7.7 0 0 0-1-1L8 7 4.3 3.3Z" />
        </svg>
      </button>
    </div>
  )
}
