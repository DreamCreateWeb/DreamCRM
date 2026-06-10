'use client'

import { useEffect } from 'react'

const TONE_CLASSES = {
  ok: 'bg-emerald-600',
  urgent: 'bg-rose-600',
  neutral: 'bg-gray-900 dark:bg-gray-700',
} as const

/**
 * Standard action feedback toast — every mutation answers within a beat.
 * Render it conditionally with the message; it auto-dismisses via `onDone`.
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
  tone?: keyof typeof TONE_CLASSES
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
      className={`fixed bottom-4 right-4 z-50 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${TONE_CLASSES[tone]}`}
    >
      {message}
    </div>
  )
}
