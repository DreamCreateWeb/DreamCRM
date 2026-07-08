'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react'
import { useRouter } from 'next/navigation'

/**
 * One app-wide realtime connection. Mounted once in the dashboard shell, it
 * opens a single EventSource to /api/realtime/stream and fans each event out to
 * whichever components subscribed to its topic via `useRealtime`. This replaces
 * the app's scattered polling loops (bell, sidebar badges, message list) with a
 * single push connection.
 *
 * Events are already org-filtered server-side; here we additionally drop
 * user-targeted events (`userId` set) that aren't for the signed-in user.
 */

export interface RealtimeEvent {
  orgId: string
  topic: string
  userId: string | null
  at: number
  [key: string]: unknown
}

type Handler = (event: RealtimeEvent) => void
interface Subscription {
  topics: Set<string>
  handler: Handler
}

interface RealtimeContextValue {
  subscribe: (topics: string[], handler: Handler) => () => void
}

const RealtimeContext = createContext<RealtimeContextValue>({
  subscribe: () => () => {},
})

export function RealtimeProvider({
  orgId,
  userId,
  children,
}: {
  orgId: string
  userId: string
  children: React.ReactNode
}) {
  const subsRef = useRef<Set<Subscription>>(new Set())

  const subscribe = useCallback((topics: string[], handler: Handler) => {
    const entry: Subscription = { topics: new Set(topics), handler }
    subsRef.current.add(entry)
    return () => {
      subsRef.current.delete(entry)
    }
  }, [])

  useEffect(() => {
    if (!orgId || typeof window === 'undefined' || !('EventSource' in window)) return
    let es: EventSource | null = null
    let stopped = false

    function open() {
      if (stopped) return
      es = new EventSource('/api/realtime/stream')
      es.onmessage = (e) => {
        let data: RealtimeEvent
        try {
          data = JSON.parse(e.data) as RealtimeEvent
        } catch {
          return
        }
        if (!data || typeof data.topic !== 'string') return
        // User-targeted event for someone else → ignore.
        if (data.userId && data.userId !== userId) return
        subsRef.current.forEach((sub) => {
          if (sub.topics.has('*') || sub.topics.has(data.topic)) {
            try {
              sub.handler(data)
            } catch {
              /* a bad handler must not break the connection */
            }
          }
        })
      }
      // EventSource auto-reconnects on error/drop (including our ~100s
      // server-side self-close), so onerror is a no-op — the browser reopens.
    }

    open()
    return () => {
      stopped = true
      es?.close()
    }
  }, [orgId, userId])

  return <RealtimeContext.Provider value={{ subscribe }}>{children}</RealtimeContext.Provider>
}

/**
 * Subscribe to one or more realtime topics. The handler always sees the latest
 * closure (no need to memoize it). Returns nothing — cleanup is automatic.
 */
export function useRealtime(topic: string | string[], handler: Handler): void {
  const { subscribe } = useContext(RealtimeContext)
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const topics = Array.isArray(topic) ? topic : [topic]
  const key = topics.join(',')
  useEffect(() => {
    return subscribe(key.split(','), (e) => handlerRef.current(e))
  }, [subscribe, key])
}

/**
 * Convenience: soft-refresh the current server component when an event lands on
 * any of the given topics, throttled so a burst can't hammer the server. The
 * refresh preserves client state (in-progress composer drafts, scroll), so it's
 * safe to fire on every inbound message.
 */
export function useRealtimeRefresh(topic: string | string[], throttleMs = 1500): void {
  const router = useRouter()
  const lastRef = useRef(0)
  useRealtime(topic, () => {
    const now = Date.now()
    if (now - lastRef.current < throttleMs) return
    lastRef.current = now
    router.refresh()
  })
}
