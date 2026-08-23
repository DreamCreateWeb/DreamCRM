import type { ReactNode } from 'react'

/**
 * ONE RHYTHM for the Dream Team page's sections (docs/ai-operations.md, D7).
 *
 * Before this the page was five sections that each invented their own
 * heading, so a long scroll read as five unrelated widgets stacked in a
 * column. The heading is the page's spine: same size, same weight, same
 * hint placement, and an optional count that ALWAYS rides the numeral face.
 * Anchors live on the <section> element, which owns the scroll offset.
 */
export default function SectionHeading({
  title,
  hint,
  count,
  countLabel,
}: {
  title: string
  hint?: ReactNode
  /** Optional count shown beside the title (numeral face, tabular). */
  count?: number
  countLabel?: string
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2
        className="flex items-baseline gap-2 text-[0.9375rem] font-bold tracking-tight text-gray-900 dark:text-gray-100"
      >
        {title}
        {typeof count === 'number' && count > 0 && (
          <span
            className="font-mono-num text-xs font-semibold tabular-nums text-gray-500 dark:text-gray-400"
            aria-label={countLabel}
          >
            {count}
          </span>
        )}
      </h2>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  )
}
