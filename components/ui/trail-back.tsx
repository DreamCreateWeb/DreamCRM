'use client'

import { useEffect, useRef, useState } from 'react'
import { useTrail } from '@/app/trail-context'

/**
 * Journey-trail back affordance — the ONLY visible UI of the trail system.
 * Lives in the header's left slot, BEFORE the page title, so the row reads
 * "← {came-from} · {current page}". Out of the way, never a full-width bar,
 * never pushes content (it sits inside the existing 56px header row).
 *
 * Behaviour (DESIGN-SYSTEM v2 — ink/teal, 12px floor, dark mode, a11y):
 *   - Renders NOTHING when there's no previous stop (first landing / direct
 *     entry) — back is offered "only when they want to", never imposed.
 *   - A compact ghost "← {previous.label}" button → `back()`.
 *   - A small chevron beside it (only when there are ≥2 prior stops) opens a
 *     `.pop-in` menu listing the trail most-recent-first, EXCLUDING the current
 *     page, so you can jump back multiple stops. This is the "only when they
 *     want to" power path, tucked away.
 * It never auto-navigates and doesn't interfere with the browser back button.
 */
export default function TrailBack() {
  const { trail, previous, back, goTo } = useTrail()
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close the jump menu on outside-click + Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // Invisible until there's somewhere to go back to.
  if (trail.length <= 1 || !previous) return null

  // Earlier stops, most-recent-first, excluding the current top. These are the
  // jump targets; their original trail index is preserved for goTo().
  const earlier = trail
    .slice(0, -1)
    .map((stop, index) => ({ stop, index }))
    .reverse()

  // The chevron menu only earns its place when there's more than one prior stop
  // (with exactly one, the back chip alone already does the job).
  const showChevron = earlier.length > 1

  return (
    <div ref={wrapRef} className="flex min-w-0 items-center" data-testid="trail-back">
      <button
        type="button"
        onClick={back}
        aria-label={`Back to ${previous.label}`}
        title={`Back to ${previous.label}`}
        className="group inline-flex min-w-0 max-w-[12rem] items-center gap-1 rounded-md py-1 pl-1 pr-1.5 text-sm text-ink-600 transition-colors hover:bg-ink-900/[0.04] hover:text-ink-900"
      >
        <svg
          className="h-3.5 w-3.5 shrink-0 fill-current text-ink-400 transition-colors group-hover:text-ink-600"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path d="M10.3 3.3 11.7 4.7 8.4 8l3.3 3.3-1.4 1.4L5.6 8z" />
        </svg>
        <span className="truncate">{previous.label}</span>
      </button>

      {showChevron && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Recent pages"
            title="Recent pages"
            className={`inline-flex h-7 w-6 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-900/[0.04] hover:text-ink-600 ${
              menuOpen ? 'bg-ink-900/[0.06] text-ink-600' : ''
            }`}
          >
            <svg
              className={`h-3 w-3 fill-current transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 12 12"
              aria-hidden="true"
            >
              <path d="M5.9 8.4 1.5 4l1-1L6 6.4 9.5 3l1 1z" />
            </svg>
          </button>

          {menuOpen && (
            <nav
              aria-label="Recent pages"
              className="pop-in absolute left-0 top-full z-30 mt-1 min-w-[12rem] max-w-[16rem] origin-top-left rounded-[var(--r-lg)] bg-surface-1 p-1 shadow-[var(--shadow-pop)]"
            >
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-ink-500">
                Recent pages
              </p>
              <ul>
                {earlier.map(({ stop, index }, i) => (
                  <li key={`${stop.pathname}-${index}`}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        goTo(index)
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink-700 transition-colors hover:bg-ink-900/[0.04] hover:text-ink-900"
                    >
                      <span className="truncate">{stop.label}</span>
                      <span className="ml-auto shrink-0 text-xs text-ink-400">
                        {i === 0 ? 'Back' : `${i + 1} back`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      )}
    </div>
  )
}
