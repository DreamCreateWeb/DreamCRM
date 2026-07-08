import 'server-only'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

/**
 * App-wide realtime broadcast, on top of Postgres LISTEN/NOTIFY.
 *
 * A server mutation calls `publishRealtime(orgId, topic, payload)`; the SSE
 * endpoint at /api/realtime/stream LISTENs on the same channel, filters to the
 * connected user's org, and forwards the event to the browser. A single
 * app-wide EventSource (RealtimeProvider) fans it out to whichever components
 * subscribed to that topic via `useRealtime`.
 *
 * This generalizes the proven inbox stream (lib/services/inbox-events.ts) into
 * one channel every surface can ride — messages, notifications, documents,
 * settings, … — so we don't open a stream per feature.
 *
 * Best-effort: never throws. A broadcast failure must not take down the
 * mutation that triggered it (the reader still catches up on its next
 * navigation / focus refresh).
 *
 * NOTE: Postgres NOTIFY payloads are capped at 8000 bytes — keep payloads to
 * ids + small hints, never full records. NOTIFY also fans out to every
 * listening connection across ALL App Runner instances, so this works even if
 * the service scales beyond one instance.
 */

/** The single NOTIFY channel every realtime event rides. */
export const REALTIME_CHANNEL = 'dcrm_events'

/** Well-known topics (open-ended — any string works, these are the wired ones). */
export type RealtimeTopic =
  | 'messages'
  | 'notifications'
  | 'documents'
  | 'settings'
  | (string & {})

export interface RealtimeEvent {
  orgId: string
  topic: string
  /** When set, only this user's browser should act on the event. */
  userId: string | null
  /** Epoch ms, stamped at publish. */
  at: number
  [key: string]: unknown
}

export async function publishRealtime(
  organizationId: string | null | undefined,
  topic: RealtimeTopic,
  payload: Record<string, unknown> = {},
  opts: { userId?: string | null } = {},
): Promise<void> {
  // Org scoping is how the stream isolates tenants — no org, no broadcast.
  if (!organizationId) return
  try {
    const body = JSON.stringify({
      orgId: organizationId,
      topic,
      userId: opts.userId ?? null,
      at: Date.now(),
      ...payload,
    })
    await db.execute(sql`SELECT pg_notify(${REALTIME_CHANNEL}, ${body})`)
  } catch (err) {
    console.warn('[realtime] publish failed', (err as Error).message)
  }
}
