import 'server-only'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import type { InboxActor } from './inbox-audit'

/**
 * Postgres NOTIFY broadcast for inbox changes. The SSE endpoint at
 * /api/inbox/stream LISTENs on the same channel and forwards matching
 * events to connected browsers, which trigger a router.refresh() so
 * new mail appears without polling.
 *
 * Payload includes message + thread + actor so future consumers
 * (specifically the agent runtime) can react without an extra DB
 * lookup. Browser only cares about kind for now.
 *
 * Best-effort: never throws — broadcast failure shouldn't take down
 * the ingest path that called it.
 */
export type InboxEventKind = 'new_message' | 'updated'

export interface InboxEventOpts {
  messageId?: string | null
  threadId?: string | null
  actor?: InboxActor
}

export async function notifyInboxChange(
  organizationId: string,
  kind: InboxEventKind = 'new_message',
  opts: InboxEventOpts = {},
): Promise<void> {
  try {
    const payload = JSON.stringify({
      orgId: organizationId,
      kind,
      messageId: opts.messageId ?? null,
      threadId: opts.threadId ?? null,
      actorKind: opts.actor?.kind ?? 'system',
      at: Date.now(),
    })
    await db.execute(sql`SELECT pg_notify('inbox_events', ${payload})`)
  } catch (err) {
    console.warn('[inbox-events] notify failed', (err as Error).message)
  }
}
