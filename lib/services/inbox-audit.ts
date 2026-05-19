import 'server-only'
import { randomUUID } from 'crypto'
import { db, schema } from '@/lib/db'
import type { InboxAction, InboxActorKind } from '@/lib/db/schema/email'

/**
 * Who performed an inbox mutation. Set on every write to the action
 * log so we can tell user-driven activity from the agent layer (once
 * that ships) and from automated/system writes (e.g. classifier).
 */
export type InboxActor =
  | { kind: 'user'; userId: string }
  | { kind: 'agent'; userId?: string | null }
  | { kind: 'system' }

export const SYSTEM_ACTOR: InboxActor = { kind: 'system' }

export interface InboxActionEntry {
  organizationId: string
  messageId?: string | null
  threadId?: string | null
  action: InboxAction
  actor: InboxActor
  meta?: Record<string, unknown> | null
}

function rowFromEntry(entry: InboxActionEntry) {
  const actorUserId =
    entry.actor.kind === 'user'
      ? entry.actor.userId
      : entry.actor.kind === 'agent'
        ? entry.actor.userId ?? null
        : null
  return {
    id: randomUUID(),
    organizationId: entry.organizationId,
    messageId: entry.messageId ?? null,
    threadId: entry.threadId ?? null,
    action: entry.action,
    actorKind: entry.actor.kind as InboxActorKind,
    actorUserId,
    meta: entry.meta ?? null,
  }
}

/**
 * Record one inbox action. Best-effort — never throws, since failure
 * to write an audit row shouldn't break the mutation that triggered
 * it.
 */
export async function logInboxAction(entry: InboxActionEntry): Promise<void> {
  try {
    await db.insert(schema.inboxActionLog).values(rowFromEntry(entry))
  } catch (err) {
    console.warn('[inbox-audit] log failed', (err as Error).message)
  }
}

/**
 * Bulk-log many actions in a single INSERT. Used by bulk mutations
 * (archive 50 threads → 50 log rows in one query).
 */
export async function logInboxActionsBulk(entries: InboxActionEntry[]): Promise<void> {
  if (entries.length === 0) return
  try {
    await db.insert(schema.inboxActionLog).values(entries.map(rowFromEntry))
  } catch (err) {
    console.warn('[inbox-audit] bulk log failed', (err as Error).message)
  }
}
