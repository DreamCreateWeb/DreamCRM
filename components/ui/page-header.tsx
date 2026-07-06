import type { ReactNode } from 'react'

/**
 * Standard module page header — one pattern for every dashboard page.
 *
 * Anatomy: eyebrow (section · context, teal-700 caps) over an H1 title
 * (ink-900, tracking-tight), optional one-line subtitle (ink-600), and a
 * right-aligned action group. The page's single PRIMARY action (a teal
 * ActionButton — pass `breath` on it for the ambient drift) lives in
 * `actions`, rightmost; the EncodingLegend (glyphs/aging/pills) goes in
 * `legend`.
 *
 * The title zone carries a soft teal `aura-chrome` halo — the brand lives in
 * the chrome, never in the data. Set `aura={false}` to suppress it.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  legend,
  aura = true,
  className = '',
}: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  legend?: ReactNode
  /** The teal aura halo behind the title zone (chrome signature). */
  aura?: boolean
  className?: string
}) {
  return (
    <div
      className={`relative sm:flex sm:items-start sm:justify-between gap-4 mb-6 ${
        aura ? 'aura-chrome -mx-4 px-4 sm:-mx-6 sm:px-6 -mt-2 pt-2 rounded-lg' : ''
      } ${className}`}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400 mb-1">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 max-w-2xl">{subtitle}</p>}
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
