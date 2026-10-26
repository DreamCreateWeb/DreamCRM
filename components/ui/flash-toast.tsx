'use client'

import { useEffect, useState } from 'react'

/**
 * v2: toasts are surface cards with a tone-tinted LEFT edge — not full-bleed
 * color fills. The tone reads at a glance; the copy stays high-contrast ink.
 */
const TONE_EDGE = {
  ok: 'border-l-emerald-500',
  warn: 'border-l-amber-500',
  urgent: 'border-l-rose-500',
  info: 'border-l-violet-500',
  special: 'border-l-fuchsia-500',
  neutral: 'border-l-gray-400 dark:border-l-gray-500',
} as const

/** The shared BulkBar's landmark — the one other thing that owns a phone's bottom edge. */
export const BULK_REGION_SELECTOR = '[role="region"][aria-label="Bulk actions"]'

/** The toast's resting offset from the bottom edge, in px (`bottom-4`). */
const REST_BOTTOM_PX = 16
/** Breathing room between a lifted toast and the bulk bar beneath it. */
const LIFT_GAP_PX = 12

/**
 * How far above the bottom edge a floating toast should sit: `undefined`
 * (the class's own `bottom-4`) unless a BulkBar is mounted, in which case the
 * bar's height plus a gap — both used to share `bottom-4`, so a bulk action's
 * confirmation painted on top of the bar it came from. Measured on mount and
 * on resize; a toast lives seconds, so that is enough.
 */
export function useBulkBarLift(): number | undefined {
  const [lift, setLift] = useState<number | undefined>(undefined)
  useEffect(() => {
    const measure = () => {
      const bar = document.querySelector<HTMLElement>(BULK_REGION_SELECTOR)
      setLift(bar ? Math.round(bar.getBoundingClientRect().height) + REST_BOTTOM_PX + LIFT_GAP_PX : undefined)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  return lift
}

/**
 * Standard action feedback toast — every mutation answers within a beat.
 * Render it conditionally with the message; it auto-dismisses via `onDone`.
 * Slides up fast on mount (Part 3); reduced-motion fades only.
 *
 *   {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
 *
 * THREE RULES (2026-10-26, WCAG 2.2.1 — timed content must be dismissible):
 *  - every toast carries a Dismiss ✕ (when there is an `onDone` to call);
 *  - an `urgent` toast is an ERROR being reported, and an error that vanishes
 *    before it is read is worse than none — so it never auto-dismisses;
 *  - the timer pauses while the toast is hovered or holds focus.
 * And it stays INSIDE a phone: `left-4 right-4` below `sm` (a long server
 * error used to run off the left edge), right-anchored and capped at `sm+`.
 */
export function FlashToast({
  message,
  tone = 'ok',
  duration = 4000,
  onDone,
  action,
  placement = 'floating',
}: {
  message: string
  tone?: keyof typeof TONE_EDGE
  duration?: number
  onDone?: () => void
  /** Optional inline action ("Undo") — clicking it runs the handler and
   *  dismisses the toast. Keep the label to one word; a toast is not a menu. */
  action?: { label: string; onClick: () => void }
  /**
   * `floating` (default) positions itself at the bottom corner; `stacked`
   * renders in flow for a parent that owns the position — the ToastProvider's
   * queue. Call sites rendering a toast directly never need to set it.
   */
  placement?: 'floating' | 'stacked'
}) {
  const persistent = tone === 'urgent'
  const [paused, setPaused] = useState(false)
  const lift = useBulkBarLift()

  useEffect(() => {
    if (!onDone || persistent || paused) return
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [onDone, duration, message, persistent, paused])

  const position =
    placement === 'floating'
      ? 'fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:max-w-md'
      : 'relative w-full sm:w-auto sm:max-w-md pointer-events-auto'

  return (
    <div
      // An urgent toast is an ERROR being reported — role="status" announced
      // it politely as if the action had succeeded. Assertive alert for
      // urgent; polite status for everything else.
      role={persistent ? 'alert' : 'status'}
      aria-live={persistent ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      style={placement === 'floating' && lift != null ? { bottom: lift } : undefined}
      className={`slide-up-fast flex items-center gap-3 rounded-[var(--r-md)] border-l-4 bg-[color:var(--color-surface-2)] shadow-[var(--shadow-pop)] py-2.5 pl-4 pr-2 text-sm font-medium text-gray-900 dark:text-gray-100 ${position} ${TONE_EDGE[tone]}`}
    >
      <span className="min-w-0 grow">{message}</span>
      {action && (
        <button
          type="button"
          onClick={() => {
            action.onClick()
            onDone?.()
          }}
          className="shrink-0 font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 underline underline-offset-2"
        >
          {action.label}
        </button>
      )}
      {onDone && (
        <button
          type="button"
          onClick={onDone}
          aria-label="Dismiss"
          title="Dismiss"
          className="-my-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200/70 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-600/50 dark:hover:text-gray-100"
        >
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M7.95 6.536l4.242-4.243a1 1 0 1 1 1.415 1.414L9.364 7.95l4.243 4.242a1 1 0 1 1-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 0 1-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 0 1 1.414-1.414L7.95 6.536z" />
          </svg>
        </button>
      )}
    </div>
  )
}
