import type { ReactNode } from 'react'

/**
 * Standard module page header — one pattern for every dashboard page.
 *
 * Anatomy: eyebrow (section · context) over an H1 title, optional one-line
 * subtitle, and a right-aligned action group. The page's single PRIMARY
 * action (solid violet ActionButton) lives in `actions`, rightmost; the
 * EncodingLegend (when the page uses glyphs/aging/pills) goes in `legend`.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  legend,
  className = '',
}: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  legend?: ReactNode
  className?: string
}) {
  return (
    <div className={`sm:flex sm:items-start sm:justify-between gap-4 mb-6 ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-1">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-2xl">{subtitle}</p>}
      </div>
      {(actions || legend) && (
        <div className="mt-4 sm:mt-0 flex flex-wrap items-center gap-2 shrink-0">
          {legend}
          {actions}
        </div>
      )}
    </div>
  )
}
