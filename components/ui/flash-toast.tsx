'use client'

import { useEffect } from 'react'

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

/**
 * Standard action feedback toast — every mutation answers within a beat.
 * Render it conditionally with the message; it auto-dismisses via `onDone`.
 * Slides up fast on mount (Part 3); reduced-motion fades only.
 *
 *   {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
 */
export function FlashToast({
  message,
  tone = 'ok',
  duration = 4000,
  onDone,
}: {
  message: string
  tone?: keyof typeof TONE_EDGE
  duration?: number
  onDone?: () => void
}) {
  useEffect(() => {
    if (!onDone) return
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [onDone, duration, message])

  return (
    <div
      role="status"
      aria-live="polite"
      className={`slide-up-fast fixed bottom-4 right-4 z-50 rounded-[var(--r-md)] border-l-4 bg-[color:var(--color-surface-2)] shadow-[var(--shadow-pop)] px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 ${TONE_EDGE[tone]}`}
    >
      {message}
    </div>
  )
}
