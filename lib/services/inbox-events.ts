import 'server-only'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'

/**
 * Postgres NOTIFY broadcast for inbox changes. The SSE endpoint at
 * /api/inbox/stream LISTENs on the same channel and forwards matching
 * events to connected browsers, which trigger a router.refresh() so
 * new mail appears without polling.
 *
 * Best-effort: never throws — broadcast failure shouldn't take down
 * the ingest path that called it.
 */
export type InboxEventKind = 'new_message' | 'updated'

export async function notifyInboxChange(
  organizationId: string,
  kind: InboxEventKind = 'new_message',
): Promise<void> {
  try {
    const payload = JSON.stringify({ orgId: organizationId, kind, at: Date.now() })
    await db.execute(sql`SELECT pg_notify('inbox_events', ${payload})`)
  } catch (err) {
    console.warn('[inbox-events] notify failed', (err as Error).message)
  }
}
