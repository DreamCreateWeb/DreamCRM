'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * The inbox's filter chips as ONE ROW that scrolls sideways below `lg` and
 * wraps above it — the content-workspace rail recipe (`overflow-x-auto
 * no-scrollbar`, then `lg:flex-wrap`). Nine chips at text-xs cannot fit a
 * 390px row; as a `flex-wrap` they stacked four rows deep above the list.
 *
 * The scroll region is focusable and named (a keyboard user can reach the
 * chips past the edge), and on mount it scrolls the chip the person just
 * picked into view (`data-keep-in-view`, set by the server on the chips the
 * URL names) — a server navigation resets the strip to x=0, which would
 * otherwise hide the very selection they made. `inline: 'nearest'` so a
 * chip already on screen moves nothing. Desktop is left alone: there the
 * strip wraps and everything is visible.
 */
export const STRIP_BREAKPOINT_PX = 1024

export default function FilterStrip({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root || window.innerWidth >= STRIP_BREAKPOINT_PX) return
    const targets = root.querySelectorAll<HTMLElement>('[data-keep-in-view]')
    const last = targets[targets.length - 1]
    if (last && typeof last.scrollIntoView === 'function') {
      last.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [])

  return (
    <div
      ref={ref}
      tabIndex={0}
      aria-label={label}
      className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 rounded-[var(--r-xs)]"
    >
      {children}
    </div>
  )
}
