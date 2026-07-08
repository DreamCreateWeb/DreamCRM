'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtime } from '@/components/realtime/realtime-provider'

/**
 * Keeps Patient Communications (/messages) live. A soft `router.refresh()`
 * re-runs the server component while React reconciliation preserves client
 * state, so an in-progress composer draft is NOT lost.
 *
 * Primary path is now REAL-TIME: it subscribes to the app-wide `messages`
 * topic (RealtimeProvider → SSE → Postgres NOTIFY), so a new inbound patient
 * message or a reply sent from another tab appears within a beat, no polling.
 * The focus/visibility refresh + a slow safety interval remain as a fallback
 * for when the stream is mid-reconnect or the browser lacks EventSource.
 */
const SAFETY_INTERVAL_MS = 120_000

export default function InboxAutoRefresh() {
  const router = useRouter()
  // Throttle: never refresh more than once every 4s (realtime bursts + focus +
  // interval can otherwise stack).
  const lastRef = useRef(0)
  function refresh() {
    const now = Date.now()
    if (now - lastRef.current < 4_000) return
    lastRef.current = now
    router.refresh()
  }
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  // Live: any message event for this org → refresh.
  useRealtime('messages', () => refreshRef.current())

  // Fallback: focus/visibility + a slow interval (covers stream reconnects).
  useEffect(() => {
    function onFocus() {
      refreshRef.current()
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') refreshRef.current()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refreshRef.current()
    }, SAFETY_INTERVAL_MS)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(id)
    }
  }, [])

  return null
}
