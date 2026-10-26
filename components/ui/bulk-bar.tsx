import type { ReactNode } from 'react'

/**
 * Standard bulk-selection bar — floats over the list while rows are
 * selected. Actions are explicit verbs ("Send 4 reminders", never just
 * "Send"); `onClear` always offers the way out.
 *
 * LAYOUT IS VIEWPORT-BOUND (2026-10-26). The bar used to be a single
 * non-wrapping row centred with `left-1/2 -translate-x-1/2` and no maximum
 * width: the agenda feeds it five controls (~650px), so at 390px the primary
 * "Send N reminders" sat ~130px past the LEFT edge and Clear past the right —
 * every bulk action on a phone was physically off-screen. Now:
 *  - below `sm` it is pinned `inset-x-3`, the count sits left and Clear right
 *    on the first row, and the actions wrap on their own row(s) beneath;
 *  - at `sm+` it is centred as before, capped at the viewport width, and
 *    still wraps rather than overflows.
 * The FlashToast lifts itself above this region (`useBulkBarLift`) so a bulk
 * action's confirmation never paints on top of the bar it came from.
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
      className={`slide-up-fast fixed bottom-4 inset-x-3 z-40 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] shadow-[var(--shadow-pop)] pl-4 pr-2 py-2 sm:inset-x-auto sm:left-1/2 sm:max-w-[calc(100vw-1.5rem)] sm:-translate-x-1/2 ${className}`}
    >
      <span className="order-1 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap tabular-nums">
        {count} {noun}
      </span>
      <div className="order-3 flex w-full flex-wrap items-center gap-2 sm:order-2 sm:w-auto">{children}</div>
      <button
        type="button"
        onClick={onClear}
        className="order-2 ml-auto min-h-9 text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 px-2 sm:order-3 sm:ml-0"
      >
        Clear
      </button>
    </div>
  )
}
