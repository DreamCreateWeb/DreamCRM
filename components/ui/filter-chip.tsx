import type { ReactNode } from 'react'

/**
 * Standard filter chip — the one toggle-chip recipe for every list view.
 * Chips FILTER (toggle state); they never perform actions. Anything with an
 * emoji/icon in its label must pass `title` so the meaning is hoverable.
 * Counts render inside the chip in tabular figures.
 */
export function FilterChip({
  active,
  onClick,
  count,
  title,
  className = '',
  children,
}: {
  active: boolean
  onClick: () => void
  count?: number
  /** Required when the label contains an emoji or non-obvious icon. */
  title?: string
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`inline-flex items-center gap-1 rounded-[var(--r-xs)] px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? // Selection ≠ status: teal tint + teal text + a hairline-strong ring.
            'bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-[color:var(--color-hairline-strong)]'
          : 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      } ${className}`}
    >
      {children}
      {typeof count === 'number' && <span className="tabular-nums opacity-70">{count}</span>}
    </button>
  )
}
