import type { ReactNode } from 'react'

/**
 * Standard bulk-selection bar — floats over the list while rows are
 * selected. Actions are explicit verbs ("Send 4 reminders", never just
 * "Send"); `onClear` always offers the way out.
 */
export function BulkBar({
  count,
  noun = 'selected',
  onClear,
  children,
  className = '',
}: {
  count: number
  /** Reads as "N selected" by default; pass e.g. "patients selected". */
  noun?: string
  onClear: () => void
  /** The bulk actions — usually <ActionButton size="sm" variant="primary">. */
  children: ReactNode
  className?: string
}) {
  if (count === 0) return null
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className={`slide-up-fast fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] shadow-[var(--shadow-pop)] pl-4 pr-2 py-2 ${className}`}
    >
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap tabular-nums">
        {count} {noun}
      </span>
      <div className="flex items-center gap-2">{children}</div>
      <button
        type="button"
        onClick={onClear}
        className="text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 px-2"
      >
        Clear
      </button>
    </div>
  )
}
