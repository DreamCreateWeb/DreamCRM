import 'server-only'
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, notExists, or, sql, type SQL } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { DECAYABLE_STATUSES } from '@/lib/db/schema/prospecting'
import {
  decayVerdict,
  isRestingReason,
  restingReason,
  withRestingReason,
  withoutRestingReason,
} from '@/lib/prospect-decay'
import type { ProspectHygieneStats, ProspectingConfig } from '@/lib/types/prospecting'
import { bumpProspectingCounter, counterDay, getProspectingConfig, getProspectingCounter } from './prospecting'

/**
 * PROSPECT HYGIENE (P-03) — the list keeps itself clean. ONE pass,
 * `runProspectHygiene`, rides the enrich cron after the re-verify sweep:
 *
 *   1. exact duplicates merge (lib/services/prospect-dedupe.ts; ≤25 a run)
 *   2. untouched rows rest (decay — the pure rule in lib/prospect-decay.ts)
 *   3. one finished territory is re-swept for NEW practices (the discovery
 *      refresh in lib/services/prospect-discovery.ts; NPPES ≤50 a run)
 *
 * Every step is fail-open with its own `hygiene` strike (one a day) and its
 * own day counter (`dedupe_merge` · `decay` · `discovery_refresh`), so a
 * broken step is a logged zero and the next step still runs.
 *
 * The WAKE lives here too: any new inbound signal (a reply, a call outcome,
 * a grader run, a demo request, a conference capture) or a re-verify that
 * improves quality puts a resting row back where it came from.
 */

const DAY_MS = 24 * 60 * 60 * 1000
export const MERGES_PER_RUN = 25
export const DECAY_PER_RUN = 200

const p = schema.prospect
const LIVE_ENROLLMENT = ['active', 'paused_ooo'] as const

// ── The wake, in SQL ────────────────────────────────────────────────────────
// Folded into an UPDATE a producer already makes (a logged call, a reply),
// so a wake never costs a second statement and never changes a row that is
// not resting. Rendered for real by tests/prospecting/hygiene-sql.test.ts.

/** The status a resting row returns to — the pure `wakeStatus`, in SQL. */
function wakeStatusSql(): SQL {
  // Each status is a cast parameter (never an untyped $n inside IN); the
  // list is folded with the template itself, not `sql.join`, so the narrow
  // `sql` stubs the sibling suites mock still take it.
  const allowed = DECAYABLE_STATUSES.map((s) => sql`${s}::text`).reduce((acc, cur) => sql`${acc}, ${cur}`)
  return sql`CASE WHEN ${p.dormantFromStatus} IN (${allowed}) THEN ${p.dormantFromStatus} ELSE 'enriched' END`
}

/** `quality_reasons` without a leading resting sentence (the one a decay
 *  always puts FIRST); any other value passes through untouched. */
export function stripRestingReasonSql(): SQL {
  return sql`CASE WHEN jsonb_typeof(${p.qualityReasons}) = 'array' AND jsonb_array_length(${p.qualityReasons}) > 0 AND (${p.qualityReasons} ->> 0) LIKE 'No touch since %' THEN ${p.qualityReasons} - 0 ELSE ${p.qualityReasons} END`
}

/**
 * The three columns a wake touches, each a no-op on a row that is not
 * resting — spread into any producer's own `.set({...})`.
 */
export function wakeSetSql(): { status: SQL; dormantFromStatus: SQL; qualityReasons: SQL } {
  return {
    status: sql`CASE WHEN ${p.status} = 'dormant' THEN (${wakeStatusSql()}) ELSE ${p.status} END`,
    dormantFromStatus: sql`CASE WHEN ${p.status} = 'dormant' THEN NULL ELSE ${p.dormantFromStatus} END`,
    qualityReasons: stripRestingReasonSql(),
  }
}

/** Wake one resting row on its own (a reply that changed nothing else). */
export async function wakeDormantProspect(prospectId: string, now: Date = new Date()): Promise<void> {
  await db
    .update(p)
    .set({
      status: wakeStatusSql(),
      dormantFromStatus: null,
      qualityReasons: stripRestingReasonSql(),
      updatedAt: now,
    })
    .where(and(eq(p.id, prospectId), eq(p.status, 'dormant')))
}

/**
 * After a re-verify of a RESTING row: an improved quality score wakes it;
 * anything else keeps the resting sentence first in `quality_reasons`
 * (the verify pass rewrites that column from the signals alone).
 */
export async function reconcileDormantAfterVerify(
  prospectId: string,
  priorQualityScore: number | null,
  now: Date = new Date(),
  opts: {
    /** `quality_reasons` as they stood BEFORE the pass rewrote them — the
     *  pass replaces the column from the signals, so the resting sentence
     *  is already gone from the row by the time this looks. */
    priorReasons?: unknown
  } = {},
): Promise<'woke' | 'resting' | 'not_dormant'> {
  const [row] = await db
    .select({ status: p.status, qualityScore: p.qualityScore, qualityReasons: p.qualityReasons, createdAt: p.createdAt, lastTouchAt: lastTouchSql() })
    .from(p)
    .where(eq(p.id, prospectId))
    .limit(1)
  if (!row || row.status !== 'dormant') return 'not_dormant'
  // IMPROVED means a number that beat the number it had. A first-ever score
  // on a never-verified row is news, not an improvement — a dead number's 0
  // must not wake a row the next decay would only rest again.
  if (priorQualityScore != null && row.qualityScore != null && row.qualityScore > priorQualityScore) {
    await wakeDormantProspect(prospectId, now)
    return 'woke'
  }
  const prior =
    (Array.isArray(opts.priorReasons) ? opts.priorReasons : []).find(isRestingReason) ??
    (Array.isArray(row.qualityReasons) ? row.qualityReasons : []).find(isRestingReason)
  // Regenerated from the same anchor the decay used: the last real touch,
  // else the record's birth — never the enrichment stamp alone.
  const since = asDate(row.lastTouchAt) ?? row.createdAt
  const reasons = [
    typeof prior === 'string' ? prior : restingReason(since),
    ...withoutRestingReason(row.qualityReasons),
  ]
  await db.update(p).set({ qualityReasons: reasons, updatedAt: now }).where(eq(p.id, prospectId))
  return 'resting'
}

// ── Decay ───────────────────────────────────────────────────────────────────

/** The last time a human or the engine did something WITH the practice:
 *  a sent touch, a logged call, an inbound event, a demo the practice
 *  booked itself, an intent signal, the enrichment itself. GREATEST skips
 *  nulls in Postgres. */
export function lastTouchSql(): SQL<string | Date | null> {
  return sql<string | Date | null>`GREATEST(
    (SELECT MAX(${schema.outreachTouchLog.sentAt}) FROM ${schema.outreachTouchLog}
       WHERE ${schema.outreachTouchLog.prospectId} = ${p.id} AND ${schema.outreachTouchLog.status} = 'sent'),
    (SELECT MAX(${schema.prospectCallLog.createdAt}) FROM ${schema.prospectCallLog}
       WHERE ${schema.prospectCallLog.prospectId} = ${p.id}),
    (SELECT MAX(${schema.outreachEvent.occurredAt}) FROM ${schema.outreachEvent}
       WHERE ${schema.outreachEvent.prospectId} = ${p.id}),
    (SELECT MAX(${schema.prospectMeeting.bookedAt}) FROM ${schema.prospectMeeting}
       WHERE ${schema.prospectMeeting.prospectId} = ${p.id}),
    ${p.intentAt},
    ${p.enrichedAt}
  )`
}

/** The decay predicate as Postgres sees it: a decayable status, no future
 *  follow-up, no live enrollment, no cold caller holding it (P-02), and
 *  the last touch (else the record's birth) before the cutoff. */
export function decayCandidateWhere(now: Date, cutoff: Date): SQL | undefined {
  return and(
    inArray(p.status, [...DECAYABLE_STATUSES]),
    or(isNull(p.nextFollowUpAt), lte(p.nextFollowUpAt, now)),
    isNull(p.assignedCallerId),
    notExists(
      db
        .select({ x: sql`1` })
        .from(schema.outreachEnrollment)
        .where(
          and(
            eq(schema.outreachEnrollment.prospectId, p.id),
            inArray(schema.outreachEnrollment.status, [...LIVE_ENROLLMENT]),
          ),
        ),
    ),
    sql`COALESCE(${lastTouchSql()}, ${p.createdAt}) < ${cutoff.toISOString()}::timestamptz`,
  )
}

export interface DecayRunResult {
  scanned: number
  rested: number
}

function asDate(v: string | Date | null): Date | null {
  if (!v) return null
  const d = typeof v === 'string' ? new Date(v) : v
  return Number.isNaN(d.getTime()) ? null : d
}

/** Rest every untouched row (≤ `limit` a run). The SQL picks, the pure
 *  verdict confirms, the write stamps where it came from and why. */
export async function runDecay(opts: { now?: Date; staleAfterDays: number; limit?: number }): Promise<DecayRunResult> {
  const now = opts.now ?? new Date()
  const cutoff = new Date(now.getTime() - opts.staleAfterDays * DAY_MS)
  const rows = await db
    .select({
      id: p.id,
      status: p.status,
      createdAt: p.createdAt,
      nextFollowUpAt: p.nextFollowUpAt,
      qualityReasons: p.qualityReasons,
      assignedCallerId: p.assignedCallerId,
      lastTouchAt: lastTouchSql(),
    })
    .from(p)
    .where(decayCandidateWhere(now, cutoff))
    .orderBy(asc(p.createdAt))
    .limit(opts.limit ?? DECAY_PER_RUN)
  const out: DecayRunResult = { scanned: rows.length, rested: 0 }
  for (const r of rows) {
    const v = decayVerdict(
      {
        status: r.status,
        lastTouchAt: asDate(r.lastTouchAt),
        createdAt: r.createdAt,
        nextFollowUpAt: r.nextFollowUpAt,
        hasOpenEnrollment: false,
        assignedToCaller: r.assignedCallerId != null,
      },
      { staleAfterDays: opts.staleAfterDays },
      now,
    )
    if (!v.dormant) continue
    await db
      .update(p)
      .set({
        status: 'dormant',
        dormantFromStatus: r.status,
        qualityReasons: withRestingReason(r.qualityReasons, v.since),
        updatedAt: now,
      })
      // Guarded on the status it had AND on the whole predicate again — a
      // reply, a logged call or a claim landing between the read and the
      // write wins (a same-status touch would pass a status-only guard),
      // and the row stays awake.
      .where(and(eq(p.id, r.id), eq(p.status, r.status), decayCandidateWhere(now, cutoff)))
    out.rested++
  }
  return out
}

// ── The one pass ────────────────────────────────────────────────────────────

export interface HygieneRunResult {
  merged: number
  rested: number
  refreshed: { state: string; zipPrefix: string; found: number; imported: number } | null
  errors: number
  skipped?: string
}

/**
 * ONE pass: exact merges, decay, one territory refresh. Each step is
 * fail-open — a throw is a logged zero plus the `hygiene` strike (once a
 * run, once a day on the ledger), never a dead cron.
 */
export async function runProspectHygiene(opts: { now?: Date; config?: ProspectingConfig } = {}): Promise<HygieneRunResult> {
  const now = opts.now ?? new Date()
  const out: HygieneRunResult = { merged: 0, rested: 0, refreshed: null, errors: 0 }
  const config = opts.config ?? (await getProspectingConfig())
  if (config.killSwitch) return { ...out, skipped: 'kill_switch' }
  const day = counterDay(now)
  let struck = false
  const strike = async (step: string, err: unknown) => {
    out.errors++
    console.error(`[prospect-hygiene] ${step} failed`, err instanceof Error ? err.message : err)
    if (struck) return
    struck = true
    try {
      const { reportProspectingFailure } = await import('./engine-failures')
      await reportProspectingFailure('hygiene', now)
    } catch (e) {
      console.error('[prospect-hygiene] failure report failed', e)
    }
  }

  try {
    const { runExactDedupeSweep } = await import('./prospect-dedupe')
    const r = await runExactDedupeSweep({ now, cap: MERGES_PER_RUN })
    out.merged = r.merged
    if (r.merged > 0) await bumpProspectingCounter(day, 'dedupe_merge', r.merged)
    if (r.errors > 0) await strike('dedupe', new Error(`${r.errors} merge(s) threw`))
  } catch (err) {
    await strike('dedupe', err)
  }

  try {
    const r = await runDecay({ now, staleAfterDays: config.hygiene.staleAfterDays })
    out.rested = r.rested
    if (r.rested > 0) await bumpProspectingCounter(day, 'decay', r.rested)
  } catch (err) {
    await strike('decay', err)
  }

  try {
    const { refreshStaleTerritory } = await import('./prospect-discovery')
    const r = await refreshStaleTerritory({ now, config })
    if (r) {
      out.refreshed = { state: r.state, zipPrefix: r.zipPrefix, found: r.found, imported: r.imported }
      await bumpProspectingCounter(day, 'discovery_refresh')
    }
  } catch (err) {
    await strike('refresh', err)
  }

  return out
}

/** The hunt panel's tile: merged today, resting now, the last refresh. */
export async function getHygieneStats(now: Date = new Date()): Promise<ProspectHygieneStats> {
  const mergedToday = await getProspectingCounter(counterDay(now), 'dedupe_merge')
  const [resting] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(p)
    .where(eq(p.status, 'dormant'))
  const [last] = await db
    .select({
      state: schema.prospectDiscoveryTask.state,
      zipPrefix: schema.prospectDiscoveryTask.zipPrefix,
      at: schema.prospectDiscoveryTask.lastRefreshedAt,
    })
    .from(schema.prospectDiscoveryTask)
    .where(isNotNull(schema.prospectDiscoveryTask.lastRefreshedAt))
    .orderBy(desc(schema.prospectDiscoveryTask.lastRefreshedAt))
    .limit(1)
  return {
    mergedToday,
    resting: resting?.n ?? 0,
    lastRefresh: last?.at ? { state: last.state, zipPrefix: last.zipPrefix, at: last.at } : null,
  }
}
