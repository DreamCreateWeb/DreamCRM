'use client'

import Link from 'next/link'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, KeyboardEvent, MouseEvent, ReactNode } from 'react'

/**
 * THE tabs primitive (ML-55b) — one accessible tablist for every tab row in
 * the app: the settings sub-tabs (`SettingsTabs`), the clinic-profile section
 * bar, the prospecting workspace nav.
 *
 *  - `role="tablist"` with Left/Right/Home/End moving FOCUS between the tabs
 *    (links stay links — Enter follows them; buttons activate on Enter/Space);
 *  - every tab is a 40px box (the chrome floor) and never wraps: the row
 *    scrolls horizontally INSIDE itself (`max-w-full overflow-x-auto`), so a
 *    phone never widens the page;
 *  - the active ink comes from the ink ramp (`text-ink-900`, which inverts in
 *    dark); an inactive tab is `ink-600`, hover `ink-900`.
 *
 * `variant="underline"` is the row-on-a-rule look; `variant="pill"` is the
 * chip bar. Render `<TabLink>` for navigation, `<Tab>` for in-page state.
 */
export type TabsVariant = 'underline' | 'pill'

const BASE =
  'inline-flex min-h-10 shrink-0 items-center whitespace-nowrap text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50'

export function tabClasses(active: boolean, variant: TabsVariant = 'underline'): string {
  if (variant === 'pill') {
    return `${BASE} rounded-[var(--r-pill)] px-3 ${
      active
        ? 'bg-teal-500/12 text-ink-900'
        : 'text-ink-600 hover:bg-gray-500/[0.08] hover:text-ink-900 dark:hover:bg-white/[0.06]'
    }`
  }
  return `${BASE} -mb-px border-b-2 px-3.5 ${
    active ? 'border-teal-500 text-ink-900' : 'border-transparent text-ink-600 hover:text-ink-900'
  }`
}

function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
  if (!keys.includes(e.key)) return
  const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'))
  if (tabs.length === 0) return
  const at = tabs.findIndex((t) => t === document.activeElement)
  let next = at
  if (e.key === 'ArrowRight') next = at < 0 ? 0 : (at + 1) % tabs.length
  else if (e.key === 'ArrowLeft') next = at < 0 ? tabs.length - 1 : (at - 1 + tabs.length) % tabs.length
  else if (e.key === 'Home') next = 0
  else next = tabs.length - 1
  e.preventDefault()
  tabs[next]?.focus()
  tabs[next]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

export function Tabs({
  label,
  variant = 'underline',
  className = '',
  children,
}: {
  /** Accessible name of the tablist. */
  label: string
  variant?: TabsVariant
  className?: string
  children: ReactNode
}) {
  const look = variant === 'pill' ? 'gap-1' : 'gap-1 border-b border-gray-200 dark:border-gray-700/60'
  return (
    // The tabs inside are the focusable elements (roving tabindex); the
    // tablist only delegates their arrow keys.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`flex max-w-full flex-nowrap overflow-x-auto no-scrollbar ${look} ${className}`}
    >
      {children}
    </div>
  )
}

/** A navigating tab (a real link). `active` marks the current page/section. */
export function TabLink({
  href,
  active,
  variant = 'underline',
  onClick,
  children,
  ...rest
}: {
  href: string
  active: boolean
  variant?: TabsVariant
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void
  children: ReactNode
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick' | 'className'>) {
  return (
    <Link
      {...rest}
      href={href}
      role="tab"
      aria-selected={active}
      aria-current={active ? 'page' : undefined}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={tabClasses(active, variant)}
    >
      {children}
    </Link>
  )
}

/** An in-page tab (a button) — the panel it controls is the caller's. */
export function Tab({
  active,
  variant = 'underline',
  className = '',
  children,
  ...rest
}: {
  active: boolean
  variant?: TabsVariant
  /** Layout only (`flex-1`, `justify-center`) — the skin is the primitive's. */
  className?: string
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'role'>) {
  return (
    <button
      type="button"
      {...rest}
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      className={`${tabClasses(active, variant)} ${className}`}
    >
      {children}
    </button>
  )
}
