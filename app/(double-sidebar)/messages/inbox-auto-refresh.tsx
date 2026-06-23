'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Keeps the unified inbox fresh without a manual reload, so a new inbound
 * message (and the unread badge) appears on its own. Uses a soft
 * `router.refresh()` — re-runs the server component while React reconciliation
 * preserves client state, so an in-progress composer draft is NOT lost.
 *
 * Triggers:
 *   - tab regains focus / becomes visible (the big one — switch back, see new)
 *   - a gentle interval while the tab is visible (paused when hidden, so a
 *     left-open tab doesn't poll the server forever in the background)
 *
 * SSE-free on purpose: /messages is server-rendered + force-dynamic, so a
 * refresh is the simplest correct live-update. (The Gmail /inbox keeps its SSE
 * stream — different surface, different mental model.)
 */
const INTERVAL_MS = 60_000

export default function InboxAutoRefresh() {
  const router = useRouter()
  // Throttle: never refresh more than once every 15s (focus + interval can
  // otherwise stack).
  const lastRef = useRef(0)

  useEffect(() => {
    function refresh() {
      const now = Date.now()
      if (now - lastRef.current < 15_000) return
      lastRef.current = now
      router.refresh()
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') refresh()
    }

    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, INTERVAL_MS)

    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(id)
    }
  }, [router])

  return null
}
