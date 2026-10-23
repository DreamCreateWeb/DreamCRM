'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BUILD_ID } from '@/lib/build-id'
import { STALE_APP_MESSAGE, buildsDiffer } from '@/lib/deployment-skew'

/** How often an open tab asks the server which build it is running. */
export const BUILD_WATCH_INTERVAL_MS = 5 * 60 * 1000
/** The custom event the Studio listens for, so its own prompt can open the
 *  moment the dashboard shell notices a newer server. */
export const BUILD_STALE_EVENT = 'dc:build-stale'

export async function fetchServerBuild(): Promise<string | null> {
  try {
    const res = await fetch('/api/version', { cache: 'no-store', credentials: 'same-origin' })
    if (!res.ok) return null
    const data = (await res.json()) as { build?: unknown }
    return typeof data.build === 'string' ? data.build : null
  } catch {
    return null
  }
}

/**
 * Watches for the server being rebuilt under an open tab. Every merge to
 * `main` deploys; a tab opened before it keeps the old bundle, and its next
 * server action is refused outright by Next.js. This checks `/api/version`
 * when the tab regains focus and on a slow timer, and offers one calm
 * Refresh when the ids differ — nothing reloads on its own, so an edit in
 * progress is never thrown away by the machine.
 */
export default function BuildWatch() {
  const [stale, setStale] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const seen = useRef<string | null>(null)

  const check = useCallback(async () => {
    const theirs = await fetchServerBuild()
    if (!theirs) return
    if (buildsDiffer(BUILD_ID, theirs)) {
      if (seen.current !== theirs) {
        // A second, newer deploy re-opens a prompt the person dismissed.
        seen.current = theirs
        setDismissed(false)
      }
      setStale(true)
      try {
        window.dispatchEvent(new CustomEvent(BUILD_STALE_EVENT, { detail: { build: theirs } }))
      } catch {
        /* an old browser without CustomEvent still gets the banner */
      }
    }
  }, [])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const t = window.setInterval(() => void check(), BUILD_WATCH_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [check])

  if (!stale || dismissed) return null
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="build-watch"
      className="slide-up-fast fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-[var(--r-md)] border-l-4 border-l-violet-500 bg-[color:var(--color-surface-2)] px-4 py-2.5 text-sm font-medium text-gray-900 shadow-[var(--shadow-pop)] dark:text-gray-100"
    >
      <span>{STALE_APP_MESSAGE}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
      >
        Refresh
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Not now"
        className="shrink-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        ×
      </button>
    </div>
  )
}
