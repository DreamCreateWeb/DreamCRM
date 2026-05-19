'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Real-time inbox updater. Holds an EventSource to /api/inbox/stream.
 * When the server pushes an `inbox_events` notification for this org
 * (sent by the ingest paths in lib/services/mailbox.ts), we run
 * router.refresh() so the new mail appears in the list and threads
 * update without the user lifting a finger.
 *
 * Throttled: bursts of events (e.g. a sync that ingests 30 messages
 * fires once per insert) collapse to a single refresh inside a 500ms
 * window. Each refresh re-fetches all the page's server data, so one
 * refresh shows everything that arrived.
 */
export default function InboxLiveUpdater() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return

    let pendingRefresh: ReturnType<typeof setTimeout> | null = null
    function scheduleRefresh() {
      if (pendingRefresh) return
      pendingRefresh = setTimeout(() => {
        pendingRefresh = null
        router.refresh()
      }, 500)
    }

    const es = new EventSource('/api/inbox/stream')

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { kind?: string }
        if (data.kind === 'new_message' || data.kind === 'updated') {
          scheduleRefresh()
        }
      } catch (err) {
        console.warn('[inbox-live] bad event payload', err)
      }
    }

    es.onerror = () => {
      // EventSource auto-reconnects with backoff; we just log and let
      // the browser handle it. Spammy errors in the console mean the
      // /api/inbox/stream endpoint is misbehaving — worth surfacing.
      // (Not changing connection state here; native EventSource
      // already retries.)
    }

    return () => {
      es.close()
      if (pendingRefresh) clearTimeout(pendingRefresh)
    }
  }, [router])

  return null
}
