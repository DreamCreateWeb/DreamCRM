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
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full bg-gray-900 dark:bg-gray-100 pl-4 pr-2 py-2 shadow-lg ${className}`}
    >
      <span className="text-sm font-medium text-gray-100 dark:text-gray-800 whitespace-nowrap tabular-nums">
        {count} {noun}
      </span>
      <div className="flex items-center gap-2">{children}</div>
      <button
        type="button"
        onClick={onClear}
        className="text-sm font-medium text-gray-400 hover:text-gray-200 dark:text-gray-500 dark:hover:text-gray-700 px-2"
      >
        Clear
      </button>
    </div>
  )
}
