import 'server-only'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'

/**
 * THE ACTION LEDGER service (Transformation Phase 1 — DESIGN.md "The North
 * Star"). Every automation records what it did here, at action time, in the
 * narrator's voice. The weekly standup, the daily brief, and the approval
 * inbox's "what happened" all read from this one stream.
 *
 * `recordAction` is deliberately fire-and-forget-safe: a ledger failure must
 * NEVER break the action it describes (the reminder still sends if the
 * bookkeeping hiccups), so it swallows errors after logging. Callers that
 * want strictness can await + inspect the boolean.
 */

export interface RecordActionInput {
  organizationId: string
  /** Capability key from lib/autonomy.ts — one vocabulary everywhere. */
  capability: string
  /** Plain-English one-liner, narrator-voiced ("Reminded Maria about
   *  Tuesday 2 PM"). Write it for the clinic to read, not for a log file. */
  summary: string
  patientId?: string | null
  detail?: Record<string, unknown> | null
  occurredAt?: Date
}

export async function recordAction(input: RecordActionInput): Promise<boolean> {
  try {
    await db.insert(schema.actionLedger).values({
      id: `act_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
      organizationId: input.organizationId,
      capability: input.capability,
      patientId: input.patientId ?? null,
      summary: input.summary,
      detail: input.detail ?? null,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    })
    return true
  } catch (e) {
    console.error('[action-ledger] record failed (action itself unaffected):', e)
    return false
  }
}

export interface LedgerEntry {
  id: string
  capability: string
  patientId: string | null
  summary: string
  detail: unknown
  occurredAt: Date
}

/** Most-recent actions for an org (the narrator's raw material). */
export async function listRecentActions(
  organizationId: string,
  opts: { since?: Date; limit?: number } = {},
): Promise<LedgerEntry[]> {
  const limit = Math.min(opts.limit ?? 100, 500)
  const rows = await db
    .select({
      id: schema.actionLedger.id,
      capability: schema.actionLedger.capability,
      patientId: schema.actionLedger.patientId,
      summary: schema.actionLedger.summary,
      detail: schema.actionLedger.detail,
      occurredAt: schema.actionLedger.occurredAt,
    })
    .from(schema.actionLedger)
    .where(
      and(
        eq(schema.actionLedger.organizationId, organizationId),
        ...(opts.since ? [gte(schema.actionLedger.occurredAt, opts.since)] : []),
      ),
    )
    .orderBy(desc(schema.actionLedger.occurredAt))
    .limit(limit)
  return rows
}

/** Per-capability counts since a moment — the standup's "41 reminders,
 *  4 posts, 6 answers" line in one query. */
export async function countActionsSince(
  organizationId: string,
  since: Date,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ capability: schema.actionLedger.capability, c: sql<number>`count(*)::int` })
    .from(schema.actionLedger)
    .where(
      and(
        eq(schema.actionLedger.organizationId, organizationId),
        gte(schema.actionLedger.occurredAt, since),
      ),
    )
    .groupBy(schema.actionLedger.capability)
  const out: Record<string, number> = {}
  for (const r of rows) out[r.capability] = Number(r.c)
  return out
}
