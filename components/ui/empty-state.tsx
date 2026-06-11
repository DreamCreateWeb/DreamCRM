import type { ReactNode } from 'react'

/**
 * Standard empty state — explains the situation AND leads with the next
 * action. Use everywhere a list/section can be empty; never render a bare
 * "No data" line. Keep `body` honest: empty because nothing exists is a
 * different sentence than empty because filters exclude everything.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className = '',
}: {
  /** Emoji or small node; decorative (hidden from screen readers). */
  icon?: ReactNode
  title: string
  body?: ReactNode
  /** The next step — usually an <ActionButton>. */
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`v2-well px-6 py-12 text-center ${className}`}>
      {icon && (
        <div className="text-3xl mb-2" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</div>
      {body && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
