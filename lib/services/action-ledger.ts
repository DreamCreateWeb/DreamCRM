import 'server-only'
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { getCapability } from '@/lib/autonomy'
import {
  FAILURE_MARKERS,
  NOT_WORK_MARKERS,
  isWorkDetail,
  type FailureKind,
} from '@/lib/ledger-markers'

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

/**
 * THE PREDICATES, GENERATED. Both of these are built by mapping over the
 * marker lists in lib/ledger-markers.ts — never hand-written — so the SQL
 * and the JavaScript cannot drift apart, which is the single defect class
 * the Phase-4 audit found over and over.
 *
 * Built per call, not at module scope: a module-level template would touch
 * the schema at import time and every test that mocks a slim schema would
 * explode on it.
 *
 * Note the self-parenthesisation on the OR. drizzle's `and()` wraps the
 * whole list in ONE pair of parens and never parenthesizes the chunks, so a
 * fragment with a bare top-level OR escapes its AND chain — which shipped
 * once as a tenant-scoping breach (every org's rows matched). A fragment
 * cannot know what it will be composed into; it parenthesizes itself.
 */
// `sql.raw` for the KEY, deliberately: these are our own compile-time
// constants from lib/ledger-markers.ts, never user input, and binding them
// as parameters would make the rendered statement unreadable to the boundary
// tests that have to check which markers it names.
const markerIsTrue = (m: string) =>
  sql`(${schema.actionLedger.detail} ->> ${sql.raw(`'${m}'`)}) = 'true'`
const markerIsNotTrue = (m: string) =>
  m === 'autonomyChange'
    ? sql`(${schema.actionLedger.detail} ->> ${sql.raw(`'${m}'`)}) is null`
    : sql`(${schema.actionLedger.detail} ->> ${sql.raw(`'${m}'`)}) is distinct from 'true'`

/** WORK only — the isWorkDetail law, in SQL, from the same list. */
export const workOnly = () =>
  sql.join(NOT_WORK_MARKERS.map(markerIsNotTrue), sql` and `)

/** Its complement: every "I tried and couldn't", of either shape. */
export const failureOnly = () => sql`(${sql.join(FAILURE_MARKERS.map(markerIsTrue), sql` or `)})`

/**
 * The write-side throttle's own question: "have I already recorded a failure
 * OF THIS KIND?"
 *
 * ROUND-6 AUDIT. Before the consolidation the hand-back wrote a different
 * marker, so it could not match the engine's throttle — and the comment at
 * the call site said exactly that. Routing both producers through one door
 * made them share a marker, so an unthrottled hand-back row (written by the
 * LAST generator step, before the flush) started suppressing the engine's
 * own strike for 24 hours across the whole org. The owner would then read a
 * cause list naming a social integration while the engine itself was down.
 *
 * Unifying the vocabulary is right; unifying it without keying the throttle
 * by KIND was the same mistake one layer over. Two terms ANDed, no OR, safe
 * in any composition.
 */
export const ownFailureMarker = (kind: FailureKind = 'engine') =>
  sql`(${markerIsTrue('failure')} and (${schema.actionLedger.detail} ->> ${sql.raw(`'failureKind'`)}) = ${kind})`

/** Entries the executors stamped as the machine acting alone (Phase 3). */
const autonomousOnly = () => sql`(${schema.actionLedger.detail} ->> 'autonomous') = 'true'`

/**
 * THE FAILURE VOCABULARY (Phase 4 — the Guardian). Until now the ledger
 * could only say what the machine DID; a failed attempt was a console line
 * nobody reads, so a clinic whose Google token expired looked exactly like
 * a clinic with nothing to do. The Guardian's whole job is telling those
 * two apart, which means "I tried X and couldn't" has to be a real entry.
 *
 * THE ONLY DOOR. Every producer records a failure here — the proposal
 * engine, the autonomy hand-back, and every automation added later. Nothing
 * else writes a failure marker by hand (there is a CI guard that fails the
 * build if it tries). That is the structural answer to the Phase-4 audit's
 * dominant defect class: when two subsystems write the same signal by
 * convention, one of them eventually gets a throttle, a marker or a
 * predicate the other doesn't.
 *
 * It is NOT work: `isWorkEntry` excludes it, so the standup's counts and
 * stories never present a failure as something that got done.
 *
 * WHERE THE RATE LIMIT LIVES. Two different jobs, deliberately split:
 *  - `onceWithin` here stops a WRITER spamming a clinic's story (an hourly
 *    cron would otherwise put 24 identical rows a day into their timeline).
 *    It is about the reader of the STORY.
 *  - The ALARM is throttled at the READER instead — the Guardian counts
 *    distinct DAYS, not rows. That is what makes it robust to a producer
 *    that legitimately writes several rows at once (the hand-back names a
 *    different card each time, so those rows are real information), and it
 *    is the lesson of verification round 3: unifying what a counter matches
 *    without unifying what limits it just moves the burst.
 */
export async function recordEngineFailure(input: {
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
  /**
   * De-dup across the WHOLE ORG rather than per capability. The proposal
   * driver needs this: its steps span five capabilities, so one underlying
   * break that surfaces in a different step each hour (a flaky provider
   * failing review drafting at 09:00 and social drafting at 10:00) bought a
   * fresh strike every time and cleared the three-strike alarm inside a
   * morning — the same crying-wolf shape the window exists to prevent,
   * arriving by a different door (verification round 2).
   */
  dedupeAcrossOrg?: boolean
  /** Provenance. One marker, one door — the kind rides alongside rather
   *  than minting a second marker for every producer. */
  kind?: FailureKind
}): Promise<boolean> {
  const { onceWithin, dedupeAcrossOrg, kind, ...rest } = input
  if (onceWithin && onceWithin > 0) {
    try {
      const since = new Date((input.occurredAt ?? new Date()).getTime() - onceWithin)
      const [existing] = await db
        .select({ id: schema.actionLedger.id })
        .from(schema.actionLedger)
        .where(
          and(
            eq(schema.actionLedger.organizationId, input.organizationId),
            ...(dedupeAcrossOrg ? [] : [eq(schema.actionLedger.capability, input.capability)]),
            gte(schema.actionLedger.occurredAt, since),
            // The throttle asks about the marker IT writes. Historical
            // `autoFailure` rows must not suppress a live engine strike.
            ownFailureMarker(kind ?? 'engine'),
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
    detail: { ...(input.detail ?? {}), failure: true, failureKind: kind ?? 'engine' },
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
  // Delegated, not re-implemented — see lib/ledger-markers.ts. This function
  // and `workOnly()` are now two renderings of ONE list.
  return isWorkDetail(detail)
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

/**
 * The OTHER half of the same window: how many times the machine tried and
 * couldn't (round-9 audit).
 *
 * `countActionsSince` is work-only, which is right — a failure is not work.
 * But that makes a week of nothing-but-failures arithmetically identical to
 * a week where nothing needed doing, and the standup went on to narrate the
 * second. Anything that reports on an empty window needs this number too,
 * or it is reporting on half the ledger and calling it the whole thing.
 *
 * Generated from the same FAILURE_MARKERS list as the Guardian's counter —
 * one vocabulary, one home (lib/ledger-markers.ts).
 */
export async function countFailuresSince(
  organizationId: string,
  since: Date,
  /**
   * `kind` narrows to ONE producer (round-11 audit). The two are not the
   * same event and must not be summed into one sentence: an `engine`
   * failure is the machine broken and still trying, while a `hand_back` is
   * the machine having deliberately STOPPED after AUTO_FAILURE_LIMIT
   * attempts and put the card back in front of a human. Counting them
   * together made the standup say "that's mine to sort out, and I'm on it"
   * about a card its own ledger sentence had just handed over — and the
   * same card was listed two lines below as waiting on them.
   */
  opts: { until?: Date; kind?: FailureKind } = {},
): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.actionLedger)
    .where(
      and(
        eq(schema.actionLedger.organizationId, organizationId),
        gte(schema.actionLedger.occurredAt, since),
        ...(opts.until ? [lt(schema.actionLedger.occurredAt, opts.until)] : []),
        opts.kind ? ownFailureMarker(opts.kind) : failureOnly(),
      ),
    )
  return Number(row?.c ?? 0)
}
