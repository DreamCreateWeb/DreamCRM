import 'server-only'
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { getCapability } from '@/lib/autonomy'

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
    // An unregistered key still records (losing the entry would be worse),
    // but it means a writer and lib/autonomy.ts drifted apart — the entry has
    // no label for the narrator and resolveTrust floors it at 'ask'. The
    // spine test scans writer literals against the registry; this catches
    // dynamic keys the scan can't see.
    if (!getCapability(input.capability)) {
      console.warn(`[action-ledger] capability '${input.capability}' is not registered in lib/autonomy.ts CAPABILITIES`)
    }
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

/** Entries the executors stamped as the machine acting alone (Phase 3). */
const autonomousOnly = () => sql`(${schema.actionLedger.detail} ->> 'autonomous') = 'true'`

/** The same rule in SQL, for the grouped count. Built per call, not at
 *  module scope: a module-level template would touch the schema at import
 *  time, which every test that mocks a slim schema would explode on. */
export const workOnly = () => sql`(${schema.actionLedger.detail} ->> 'autonomyChange') is null
  and (${schema.actionLedger.detail} ->> 'autoFailure') is distinct from 'true'
  and (${schema.actionLedger.detail} ->> 'failure') is distinct from 'true'
  and (${schema.actionLedger.detail} ->> 'report') is distinct from 'true'`

/**
 * THE FAILURE VOCABULARY (Phase 4 — the Guardian). Until now the ledger
 * could only say what the machine DID; a failed attempt was a console line
 * nobody reads, so a clinic whose Google token expired looked exactly like
 * a clinic with nothing to do. The Guardian's whole job is telling those
 * two apart, which means "I tried X and couldn't" has to be a real entry.
 *
 * It is NOT work: `isWorkEntry` excludes it, so the standup's counts and
 * stories never present a failure as something that got done. (Phase 3's
 * hand-back note was the first instance of this shape; this generalizes it
 * so every automation can speak the same way.)
 */
export async function recordFailure(input: {
  organizationId: string
  capability: string
  /** Plain English, narrator-voiced, from the clinic's side of the glass:
   *  "Couldn't post to Instagram — the connection needs renewing." */
  summary: string
  patientId?: string | null
  detail?: Record<string, unknown> | null
  occurredAt?: Date
  /**
   * Record at most ONE failure for this (org, capability) inside this many
   * milliseconds. Anything driven by a cron needs this: a generator broken
   * at 09:00 is still broken at 10:00, and an hourly writer would put 24
   * identical rows a day into a clinic's own story and trip the Guardian's
   * three-strike alarm before lunch on day one. With the window set, a
   * persistent break reads as one strike per window — so `FAILURE_ALARM_COUNT`
   * measures DAYS of a broken thing rather than hours.
   *
   * Returns false when suppressed, exactly as it does when the write fails;
   * no caller has anything different to do in the two cases.
   */
  onceWithin?: number
}): Promise<boolean> {
  const { onceWithin, ...rest } = input
  if (onceWithin && onceWithin > 0) {
    try {
      const since = new Date((input.occurredAt ?? new Date()).getTime() - onceWithin)
      const [existing] = await db
        .select({ id: schema.actionLedger.id })
        .from(schema.actionLedger)
        .where(
          and(
            eq(schema.actionLedger.organizationId, input.organizationId),
            eq(schema.actionLedger.capability, input.capability),
            gte(schema.actionLedger.occurredAt, since),
            sql`(${schema.actionLedger.detail} ->> 'failure') = 'true'`,
          ),
        )
        .limit(1)
      if (existing) return false
    } catch (e) {
      // An unreadable ledger must not SWALLOW the failure — the whole point
      // is not going blind. Fall through and record it; a duplicate row is
      // far cheaper than a silent break.
      console.error('[action-ledger] failure de-dup read failed, recording anyway:', e)
    }
  }
  return recordAction({
    ...rest,
    detail: { ...(input.detail ?? {}), failure: true },
  })
}

export interface LedgerEntry {
  id: string
  capability: string
  patientId: string | null
  summary: string
  detail: unknown
  occurredAt: Date
}

/** Most-recent actions for an org (the narrator's raw material). `until` is
 *  EXCLUSIVE — [since, until) — so week windows tile without double-counting
 *  the boundary instant (Phase 2: the standup's consumer arrived, per the
 *  round-3 backlog item). */
export async function listRecentActions(
  organizationId: string,
  opts: { since?: Date; until?: Date; limit?: number; autonomousOnly?: boolean } = {},
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
        ...(opts.until ? [lt(schema.actionLedger.occurredAt, opts.until)] : []),
        // FILTER IN SQL, never after the slice (round-2 audit): the limit
        // caps rows the DATABASE returns, so a caller wanting only the
        // machine's own work got the newest N rows of everything and then
        // threw most of them away — on a clinic writing one row per
        // reminder, a whole week of autonomous work fell off the end and
        // the Overview strip said "nothing on my own yet".
        ...(opts.autonomousOnly ? [autonomousOnly()] : []),
      ),
    )
    .orderBy(desc(schema.actionLedger.occurredAt))
    .limit(limit)
  return rows
}

/** Whether a ledger entry already narrates THE WORK of this proposal
 *  (detail.proposalId — approveProposal always stamps it). The
 *  recovery-narration path uses this as its double-narration guard: a
 *  stranded approve whose recordAction DID run (only the executedAt stamp
 *  failed) must not get a second entry when the reconcile-reopen-retire
 *  loop closes it.
 *
 *  WORK ONLY (round-2 audit). The hand-back note carries the same
 *  proposalId and is explicitly NOT work — without this filter, a card the
 *  machine gave up on and a human then approved published its reply / sent
 *  its campaign for real and wrote NOTHING to the ledger, because the
 *  guard mistook "I couldn't do this" for "this was already narrated".
 *  Narrate-exactly-once had become narrate-zero. */
export async function hasEntryForProposal(
  organizationId: string,
  proposalId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.actionLedger.id })
    .from(schema.actionLedger)
    .where(
      and(
        eq(schema.actionLedger.organizationId, organizationId),
        sql`${schema.actionLedger.detail}->>'proposalId' = ${proposalId}`,
        workOnly(),
      ),
    )
    .limit(1)
  return !!row
}

/**
 * NOT WORK (round-1 Phase-3 audit; extended in Phase 4). Three kinds of
 * entry belong in the clinic's story but are not something the machine DID
 * for them: an autonomy grant/revoke (a settings change — filed under the
 * capability it changes so the story can later explain why the asking
 * stopped), a hand-back note (the machine gave up on one card), and a
 * FAILURE (it tried and couldn't — the Guardian's raw material). Counting
 * any of them as work made the standup report "1 review reply" in a week
 * when zero replies went out, in the product's flagship honesty surface.
 */
export function isWorkEntry(detail: unknown): boolean {
  if (!detail || typeof detail !== 'object') return true
  const d = detail as Record<string, unknown>
  return (
    d.autonomyChange === undefined &&
    d.autoFailure !== true &&
    d.failure !== true &&
    // A REPORT (Phase 4): the Guardian's own heads-up. Round-1 audit — it
    // counted as work, so the machine noticing a clinic was silent made
    // that clinic look less silent in the very liveness test that produced
    // the note. A watcher must not be able to satisfy its own alarm.
    d.report !== true
  )
}
/** Per-capability counts in a window — the standup's "41 reminders,
 *  4 posts, 6 answers" line in one query. `until` exclusive, as above.
 *  WORK only: settings changes and "I couldn't" notes never count. */
export async function countActionsSince(
  organizationId: string,
  since: Date,
  opts: { until?: Date } = {},
): Promise<Record<string, number>> {
  const rows = await db
    .select({ capability: schema.actionLedger.capability, c: sql<number>`count(*)::int` })
    .from(schema.actionLedger)
    .where(
      and(
        eq(schema.actionLedger.organizationId, organizationId),
        gte(schema.actionLedger.occurredAt, since),
        ...(opts.until ? [lt(schema.actionLedger.occurredAt, opts.until)] : []),
        workOnly(),
      ),
    )
    .groupBy(schema.actionLedger.capability)
  const out: Record<string, number> = {}
  for (const r of rows) out[r.capability] = Number(r.c)
  return out
}
