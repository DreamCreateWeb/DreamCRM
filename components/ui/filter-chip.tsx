import type { ReactNode } from 'react'
import Link from 'next/link'

/**
 * Standard filter chip — the one toggle-chip recipe for every list view.
 * Chips FILTER (toggle state); they never perform actions. Anything with an
 * emoji/icon in its label must pass `title` so the meaning is hoverable.
 * Counts render inside the chip in tabular figures.
 *
 * Two modes, one skin: pass `onClick` for client-state filters (a <button>), or
 * `href` for server-navigation filters (a <Link>, e.g. the RSC Messages bar) —
 * so there's a single recipe instead of a hand-rolled link copy.
 */
function chipClass(active: boolean, className: string) {
  return `inline-flex items-center gap-1 rounded-[var(--r-xs)] px-2.5 py-1 text-xs font-medium transition-colors ${
    active
      ? // Selection ≠ status: teal tint + teal text + a hairline-strong ring.
        'bg-teal-500/15 text-teal-800 dark:text-teal-200 font-semibold ring-1 ring-inset ring-teal-500/60'
      : 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
  } ${className}`
}

export function FilterChip({
  active,
  onClick,
  href,
  count,
  title,
  className = '',
  children,
}: {
  active: boolean
  /** Client-state toggle. Provide this OR `href`. */
  onClick?: () => void
  /** Server-navigation target — renders the chip as a link instead of a button. */
  href?: string
  count?: number
  /** Required when the label contains an emoji or non-obvious icon. */
  title?: string
  className?: string
  children: ReactNode
}) {
  const inner = (
    <>
      {children}
      {typeof count === 'number' && <span className="tabular-nums opacity-70">{count}</span>}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        title={title}
        aria-current={active ? 'page' : undefined}
        className={chipClass(active, className)}
      >
        {inner}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={chipClass(active, className)}
    >
      {inner}
    </button>
  )
}
