import 'server-only'
import { and, eq, inArray, isNotNull, ne, or, sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  dedupeKeys,
  duplicateReasons,
  exactDuplicatePairs,
  isExactDuplicate,
  normalizePracticeName,
  pickSurvivor,
  type DedupeRow,
} from '@/lib/prospect-dedupe'
import { wakeStatus, withoutRestingReason } from '@/lib/prospect-decay'
import type { DuplicateCandidate, ProspectStatus, ProspectVerification } from '@/lib/types/prospecting'

/**
 * DEDUPE THAT CANNOT LOSE DATA (P-03).
 *
 * A merge keeps the SURVIVOR (lib/prospect-dedupe.ts: best quality score,
 * then most recent verification, then oldest record) and folds the loser
 * into it: every row that pointed at the loser — contacts, call log,
 * meetings, enrollments, touch logs, events, suppressions, grader runs,
 * conference captures — is re-pointed at the survivor; every field the
 * survivor lacked is filled from the loser; the loser is stamped
 * `status = 'merged'` + `merged_into_prospect_id` and NEVER deleted. All
 * of it in one transaction.
 *
 * Two unique indexes shape the re-point: one LIVE enrollment per prospect
 * (the loser's live drip stops when the survivor already has one — the
 * survivor's thread is the one a reply would land on) and one contact row
 * per (prospect, email) — a loser's address the survivor already holds is
 * the same address, so that one row goes; the address stays.
 *
 * The SWEEP merges only EXACT pairs (same Google listing, or same phone AND
 * same name) on its own; a fuzzy candidate waits for the drawer.
 */

type ProspectRow = typeof schema.prospect.$inferSelect
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const LIVE_ENROLLMENT = ['active', 'paused_ooo'] as const

/** A status no merge may move a row OUT of: the practice said no, is gone,
 *  asked never to hear from us, or became a clinic. A survivor in one of
 *  these never takes a loser's live drip, follow-up or intent; a loser in
 *  one of the first three carries its verdict ONTO the survivor. */
const TERMINAL_STATUSES = ['not_interested', 'disqualified', 'suppressed', 'converted'] as const
const CARRIED_TERMINAL = ['not_interested', 'disqualified', 'suppressed'] as const
const isTerminal = (status: string) => (TERMINAL_STATUSES as readonly string[]).includes(status)

/** Rendered by the boundary test — the one raw fragment the sweep's
 *  group-by uses. */
export const HAVING_MORE_THAN_ONE = sql`count(*) > 1`

/**
 * The stored phone as the ten NANP digits the matcher keys on. Writers
 * store ten digits today, but a hand-added "+1 (404) 555-1234" from before
 * the fix sits as eleven; comparing the raw column never brought the two
 * spellings to the matcher. Rendered by tests/prospecting/hygiene-sql.test.ts.
 */
export function tenDigitPhoneSql(column: SQL | AnyColumn = schema.prospect.phone): SQL<string> {
  return sql<string>`regexp_replace(regexp_replace(coalesce(${column}, ''), '\\D', '', 'g'), '^1(\\d{10})$', '\\1')`
}

/**
 * Follow a merged row to the row that kept its history. A chain is
 * possible (A merged into B, B later into C); five hops is far beyond any
 * real one and stops a cycle a bad write could leave behind.
 */
export async function survivorOf(prospectId: string): Promise<string> {
  let id = prospectId
  for (let hop = 0; hop < 5; hop++) {
    const [row] = await db
      .select({ status: schema.prospect.status, mergedInto: schema.prospect.mergedIntoProspectId })
      .from(schema.prospect)
      .where(eq(schema.prospect.id, id))
      .limit(1)
    if (!row || row.status !== 'merged' || !row.mergedInto || row.mergedInto === id) return id
    id = row.mergedInto
  }
  return id
}

function toDedupeRow(p: ProspectRow): DedupeRow {
  return {
    id: p.id,
    name: p.name,
    phone: p.phone,
    googlePlaceId: p.googlePlaceId,
    postalCode: p.postalCode,
    qualityScore: p.qualityScore,
    verifiedAt: p.verifiedAt,
    createdAt: p.createdAt,
  }
}

/**
 * The survivor between candidates, with one rule the pure picker does not
 * know: a CONVERTED prospect is a real clinic and can only ever be the
 * survivor; two converted rows are two clinics and never merge.
 */
export function chooseSurvivor(rows: ProspectRow[]): ProspectRow | null {
  const converted = rows.filter((r) => r.status === 'converted')
  if (converted.length > 1) return null
  if (converted.length === 1) return converted[0]
  const picked = pickSurvivor(rows.map(toDedupeRow))
  return rows.find((r) => r.id === picked.id) ?? null
}

/**
 * Possible duplicates of one prospect, by the matcher's three keys: rows
 * sharing its phone, its Google place id, or its normalized name at its
 * ZIP. Excludes merged rows (they already went somewhere). Exact ones first.
 */
export async function findDuplicateCandidates(prospectId: string, limit = 5): Promise<DuplicateCandidate[]> {
  const [me] = await db.select().from(schema.prospect).where(eq(schema.prospect.id, prospectId)).limit(1)
  if (!me || me.status === 'merged') return []
  const keys = dedupeKeys(me)
  const conds = []
  if (keys.phone) conds.push(eq(tenDigitPhoneSql(), keys.phone))
  if (keys.place) conds.push(eq(schema.prospect.googlePlaceId, keys.place))
  if (keys.nameZip) conds.push(eq(schema.prospect.postalCode, me.postalCode as string))
  if (conds.length === 0) return []
  const rows = await db
    .select()
    .from(schema.prospect)
    .where(and(ne(schema.prospect.id, me.id), ne(schema.prospect.status, 'merged'), or(...conds)))
    .limit(40)
  const mine = toDedupeRow(me)
  const out: DuplicateCandidate[] = []
  for (const r of rows) {
    const theirs = toDedupeRow(r)
    const reasons = duplicateReasons(mine, theirs)
    if (reasons.length === 0) continue // a ZIP neighbour with a different name
    out.push({
      id: r.id,
      name: r.name,
      city: r.city,
      state: r.state,
      status: r.status as ProspectStatus,
      qualityScore: r.qualityScore,
      reasons,
      exact: isExactDuplicate(mine, theirs),
    })
  }
  return out.sort((a, b) => Number(b.exact) - Number(a.exact)).slice(0, limit)
}

/** The columns a survivor takes from the loser when its own are empty —
 *  never a unique key (the NPI MOVES, below, so the index never sees it
 *  twice; the dedupe hash stays put), never the audit stamps, and never the
 *  phone on its own (the phone travels with its verdict — PHONE_GROUP). */
const FILL_COLUMNS = [
  'addressLine1',
  'city',
  'state',
  'postalCode',
  'taxonomyCode',
  'authorizedOfficialName',
  'authorizedOfficialTitle',
  'timezone',
  'email',
  'emailSource',
  'websiteUrl',
  'googlePlaceId',
  'googleRatingTenths',
  'reviewCount',
  'businessStatus',
  'googleMapsUri',
  'enrichment',
  'aiVerdict',
  'opportunityScore',
  'scoreBand',
  'scoreReasons',
  'enrichedAt',
  'scoredAt',
  'intentSignal',
  'intentAt',
  'intentSummary',
  'talkingPoints',
  'replyDraft',
  'demoBrief',
  'callScript',
  'nextFollowUpAt',
  'followUpReason',
  'verification',
  'verifiedAt',
  'qualityScore',
  'qualityBand',
  'qualityReasons',
  'agencyProjectId',
] as const satisfies ReadonlyArray<keyof ProspectRow>

/** A number and what we know about it move TOGETHER: a loser's
 *  disconnected number must never land on the survivor as "unknown" (the
 *  verify pass stamps `unknown` on every pass, so the survivor's status is
 *  rarely null even when its phone is). */
const PHONE_GROUP = ['phone', 'phoneStatus', 'phoneLineType', 'phoneSource', 'phoneValidatedAt'] as const satisfies ReadonlyArray<
  keyof ProspectRow
>

/** What a terminal survivor never takes from a loser: the loser's thread
 *  is over the moment it folds into a practice that said no. */
const NOT_FOR_TERMINAL = new Set<keyof ProspectRow>([
  'nextFollowUpAt',
  'followUpReason',
  'replyDraft',
  'intentSignal',
  'intentAt',
  'intentSummary',
  'talkingPoints',
])

/** How far along the pipeline a status is — a merge never moves the
 *  survivor BACKWARD, and a hand-raiser's signal on the loser is kept. */
const STATUS_RANK: Record<string, number> = {
  discovered: 0,
  enriching: 0,
  dormant: 0,
  enriched: 1,
  queued: 2,
  contacted: 3,
  engaged: 4,
  call_list: 5,
}

export interface MergeResult {
  ok: true
  survivorId: string
  loserId: string
  /** How many FK rows moved, per table — for the sweep's log line. */
  moved: Record<string, number>
}

export type MergeRefusalReason = 'not_found' | 'same_row' | 'already_merged' | 'loser_converted' | 'loser_terminal' | 'both_converted'
export type MergeRefusal = { ok: false; reason: MergeRefusalReason }

/**
 * Fold `loserId` into `survivorId`. The caller picked the survivor
 * (`chooseSurvivor` / the drawer); this only refuses the impossible. Both
 * rows are read INSIDE the transaction under `FOR UPDATE`, so a concurrent
 * merge (the sweep and the drawer at once) cannot re-point children onto a
 * row that was merged a moment ago.
 */
export async function mergeProspects(
  survivorId: string,
  loserId: string,
  opts: { now?: Date } = {},
): Promise<MergeResult | MergeRefusal> {
  if (survivorId === loserId) return { ok: false, reason: 'same_row' }
  const now = opts.now ?? new Date()
  const moved: Record<string, number> = {}

  const refusal = await db.transaction(async (tx: Tx): Promise<MergeRefusal | null> => {
    const rows = await tx
      .select()
      .from(schema.prospect)
      .where(inArray(schema.prospect.id, [survivorId, loserId]))
      .for('update')
    const survivor = rows.find((r) => r.id === survivorId)
    const loser = rows.find((r) => r.id === loserId)
    if (!survivor || !loser) return { ok: false, reason: 'not_found' }
    if (survivor.status === 'merged' || loser.status === 'merged') return { ok: false, reason: 'already_merged' }
    if (loser.status === 'converted') return { ok: false, reason: 'loser_converted' }
    // A loser's "no" / "gone" / "never again" is carried onto the survivor —
    // except onto a clinic, where it would be nonsense: those stay two rows.
    const loserCarries = (CARRIED_TERMINAL as readonly string[]).includes(loser.status)
    if (loserCarries && survivor.status === 'converted') return { ok: false, reason: 'loser_terminal' }
    const survivorTerminal = isTerminal(survivor.status) || loserCarries

    // ── Contacts: one row per (prospect, email) ──────────────────────────
    const survivorContacts = await tx
      .select({ email: schema.prospectContact.email })
      .from(schema.prospectContact)
      .where(eq(schema.prospectContact.prospectId, survivorId))
    const held = new Set(survivorContacts.map((c) => c.email))
    const loserContacts = await tx
      .select({ id: schema.prospectContact.id, email: schema.prospectContact.email })
      .from(schema.prospectContact)
      .where(eq(schema.prospectContact.prospectId, loserId))
    const duplicateIds = loserContacts.filter((c) => held.has(c.email)).map((c) => c.id)
    const moveIds = loserContacts.filter((c) => !held.has(c.email)).map((c) => c.id)
    if (duplicateIds.length > 0) {
      await tx.delete(schema.prospectContact).where(inArray(schema.prospectContact.id, duplicateIds))
    }
    if (moveIds.length > 0) {
      // The survivor keeps its own send target; a moved address joins the
      // ranked pool and the next contact sync may promote it.
      await tx
        .update(schema.prospectContact)
        .set({ prospectId: survivorId, isPrimary: 0, updatedAt: now })
        .where(inArray(schema.prospectContact.id, moveIds))
    }
    moved.prospect_contact = moveIds.length

    // ── Enrollments: one LIVE drip per prospect, none on a closed thread ──
    const [survivorLive] = await tx
      .select({ id: schema.outreachEnrollment.id })
      .from(schema.outreachEnrollment)
      .where(
        and(
          eq(schema.outreachEnrollment.prospectId, survivorId),
          inArray(schema.outreachEnrollment.status, [...LIVE_ENROLLMENT]),
        ),
      )
      .limit(1)
    // A loser's live drip never re-points onto a survivor that already has
    // one — nor onto a practice that said no, is gone, unsubscribed or
    // became a clinic (enrollProspect refuses those; the merge must too).
    if (survivorLive || survivorTerminal) {
      await tx
        .update(schema.outreachEnrollment)
        .set({ status: 'stopped_manual', stoppedAt: now, stopReason: 'merged' })
        .where(
          and(
            eq(schema.outreachEnrollment.prospectId, loserId),
            inArray(schema.outreachEnrollment.status, [...LIVE_ENROLLMENT]),
          ),
        )
    }
    // The loser's verdict closes the survivor's own thread too.
    if (loserCarries) {
      await tx
        .update(schema.outreachEnrollment)
        .set({ status: 'stopped_manual', stoppedAt: now, stopReason: `merged_${loser.status}` })
        .where(
          and(
            eq(schema.outreachEnrollment.prospectId, survivorId),
            inArray(schema.outreachEnrollment.status, [...LIVE_ENROLLMENT]),
          ),
        )
    }
    const enrollments = await tx
      .update(schema.outreachEnrollment)
      .set({ prospectId: survivorId })
      .where(eq(schema.outreachEnrollment.prospectId, loserId))
      .returning({ id: schema.outreachEnrollment.id })
    moved.outreach_enrollment = enrollments.length

    // ── Everything else that names the loser ─────────────────────────────
    const calls = await tx
      .update(schema.prospectCallLog)
      .set({ prospectId: survivorId })
      .where(eq(schema.prospectCallLog.prospectId, loserId))
      .returning({ id: schema.prospectCallLog.id })
    moved.prospect_call_log = calls.length
    const meetings = await tx
      .update(schema.prospectMeeting)
      .set({ prospectId: survivorId, updatedAt: now })
      .where(eq(schema.prospectMeeting.prospectId, loserId))
      .returning({ id: schema.prospectMeeting.id })
    moved.prospect_meeting = meetings.length
    const touches = await tx
      .update(schema.outreachTouchLog)
      .set({ prospectId: survivorId })
      .where(eq(schema.outreachTouchLog.prospectId, loserId))
      .returning({ id: schema.outreachTouchLog.id })
    moved.outreach_touch_log = touches.length
    const events = await tx
      .update(schema.outreachEvent)
      .set({ prospectId: survivorId })
      .where(eq(schema.outreachEvent.prospectId, loserId))
      .returning({ id: schema.outreachEvent.id })
    moved.outreach_event = events.length
    const suppressions = await tx
      .update(schema.prospectSuppression)
      .set({ prospectId: survivorId })
      .where(eq(schema.prospectSuppression.prospectId, loserId))
      .returning({ id: schema.prospectSuppression.id })
    moved.prospect_suppression = suppressions.length
    const grades = await tx
      .update(schema.practiceGrade)
      .set({ prospectId: survivorId })
      .where(eq(schema.practiceGrade.prospectId, loserId))
      .returning({ id: schema.practiceGrade.id })
    moved.practice_grade = grades.length
    const captures = await tx
      .update(schema.eventCapture)
      .set({ prospectId: survivorId })
      .where(eq(schema.eventCapture.prospectId, loserId))
      .returning({ id: schema.eventCapture.id })
    moved.event_capture = captures.length

    // ── The survivor takes what it lacked ────────────────────────────────
    const patch: Partial<ProspectRow> = { updatedAt: now }
    for (const col of FILL_COLUMNS) {
      if (survivorTerminal && NOT_FOR_TERMINAL.has(col)) continue
      if (survivor[col] == null && loser[col] != null) (patch as Record<string, unknown>)[col] = loser[col]
    }
    // A resting loser's sentence never travels: it describes the loser.
    if (patch.qualityReasons !== undefined) {
      const kept = withoutRestingReason(patch.qualityReasons)
      if (kept.length > 0) patch.qualityReasons = kept
      else delete patch.qualityReasons
    }
    // The phone and its verdict, as one.
    if (survivor.phone == null && loser.phone != null) {
      for (const col of PHONE_GROUP) (patch as Record<string, unknown>)[col] = loser[col]
      const loserPhoneSignal = (loser.verification as ProspectVerification | null)?.phone
      if (loserPhoneSignal) {
        const base = (patch.verification ?? survivor.verification ?? {}) as ProspectVerification
        patch.verification = { ...base, phone: loserPhoneSignal }
      }
    }
    // The NPI MOVES: cleared on the loser first, so the unique index never
    // holds it twice inside the transaction.
    if (survivor.npiNumber == null && loser.npiNumber != null) {
      await tx.update(schema.prospect).set({ npiNumber: null, updatedAt: now }).where(eq(schema.prospect.id, loserId))
      patch.npiNumber = loser.npiNumber
    }
    // The nearer promised follow-up wins — a callback is a promise.
    if (!survivorTerminal && survivor.nextFollowUpAt && loser.nextFollowUpAt && loser.nextFollowUpAt < survivor.nextFollowUpAt) {
      patch.nextFollowUpAt = loser.nextFollowUpAt
      patch.followUpReason = loser.followUpReason
    }

    if (loserCarries) {
      // The practice said no / is gone / asked never again — on the loser's
      // row. That verdict is the practice's, so the survivor takes it, and
      // every open thread on the survivor closes with it.
      patch.status = loser.status
      patch.dormantFromStatus = null
      patch.outcomeAt = survivor.outcomeAt ?? loser.outcomeAt ?? now
      if (survivor.lostReason == null && loser.lostReason != null) patch.lostReason = loser.lostReason
      if (survivor.suppressedReason == null && loser.suppressedReason != null) patch.suppressedReason = loser.suppressedReason
      if (survivor.suppressedAt == null && loser.suppressedAt != null) patch.suppressedAt = loser.suppressedAt
      patch.nextFollowUpAt = null
      patch.followUpReason = null
      patch.replyDraft = null
      if (survivor.status === 'dormant') patch.qualityReasons = withoutRestingReason(survivor.qualityReasons)
    } else {
      const loserStatus = loser.status === 'dormant' ? wakeStatus(loser.dormantFromStatus) : loser.status
      const loserRank = STATUS_RANK[loserStatus]
      const survivorRank = STATUS_RANK[survivor.status]
      if (
        !survivorTerminal &&
        loserRank !== undefined &&
        survivorRank !== undefined &&
        loserRank > survivorRank
      ) {
        patch.status = loserStatus
        patch.dormantFromStatus = null
        // A resting survivor wakes here — its resting sentence goes with it.
        if (survivor.status === 'dormant') patch.qualityReasons = withoutRestingReason(survivor.qualityReasons)
        if (survivorRank <= STATUS_RANK.enriched && loser.intentAt) {
          patch.intentSignal = loser.intentSignal
          patch.intentAt = loser.intentAt
          patch.intentSummary = loser.intentSummary
          patch.talkingPoints = loser.talkingPoints
        }
      }
    }

    // ── The cold caller (P-02): a closed thread frees the slot; an open one
    //    carries over only when nobody holds the survivor already ────────
    if (survivorTerminal) {
      if (survivor.assignedCallerId != null) {
        patch.assignedCallerId = null
        patch.assignedAt = null
      }
    } else if (survivor.assignedCallerId == null && loser.assignedCallerId != null) {
      patch.assignedCallerId = loser.assignedCallerId
      patch.assignedAt = loser.assignedAt ?? now
    }

    await tx
      .update(schema.prospect)
      .set(patch)
      .where(and(eq(schema.prospect.id, survivorId), ne(schema.prospect.status, 'merged')))

    // ── The loser rests under its survivor, nothing deleted ──────────────
    await tx
      .update(schema.prospect)
      .set({
        status: 'merged',
        mergedIntoProspectId: survivorId,
        dormantFromStatus: null,
        nextFollowUpAt: null,
        followUpReason: null,
        assignedCallerId: null,
        assignedAt: null,
        updatedAt: now,
      })
      .where(and(eq(schema.prospect.id, loserId), ne(schema.prospect.status, 'merged')))
    return null
  })
  if (refusal) return refusal

  return { ok: true, survivorId, loserId, moved }
}

/**
 * The drawer's door: merge two rows and let the survivor rule decide which
 * one stays. Follows either id through an earlier merge first.
 */
export async function mergeDuplicateProspects(
  aId: string,
  bId: string,
  opts: { now?: Date } = {},
): Promise<MergeResult | MergeRefusal> {
  const a = await survivorOf(aId)
  const b = await survivorOf(bId)
  if (a === b) return { ok: false, reason: 'same_row' }
  const rows = await db.select().from(schema.prospect).where(inArray(schema.prospect.id, [a, b]))
  if (rows.length < 2) return { ok: false, reason: 'not_found' }
  const survivor = chooseSurvivor(rows)
  if (!survivor) return { ok: false, reason: 'both_converted' }
  const loser = rows.find((r) => r.id !== survivor.id)!
  return mergeProspects(survivor.id, loser.id, opts)
}

export interface DedupeSweepResult {
  groups: number
  merged: number
  skipped: number
  errors: number
}

/**
 * The sweep's half: find rows sharing a Google place id or a phone, merge
 * the EXACT pairs (place id, or phone + same normalized name), cap per run.
 * Everything else — same phone, different names — stays for the drawer.
 */
export async function runExactDedupeSweep(opts: { now?: Date; cap?: number } = {}): Promise<DedupeSweepResult> {
  const now = opts.now ?? new Date()
  const cap = opts.cap ?? 25
  const out: DedupeSweepResult = { groups: 0, merged: 0, skipped: 0, errors: 0 }
  const live = ne(schema.prospect.status, 'merged')

  const placeGroups = await db
    .select({ key: schema.prospect.googlePlaceId })
    .from(schema.prospect)
    .where(and(live, isNotNull(schema.prospect.googlePlaceId)))
    .groupBy(schema.prospect.googlePlaceId)
    .having(HAVING_MORE_THAN_ONE)
    .limit(50)
  // Grouped on the ten-digit KEY, never the raw column — a legacy eleven-
  // digit row and its ten-digit twin are one group.
  const phoneKeySql = tenDigitPhoneSql()
  const phoneGroups = await db
    .select({ key: phoneKeySql })
    .from(schema.prospect)
    .where(and(live, isNotNull(schema.prospect.phone)))
    .groupBy(phoneKeySql)
    .having(HAVING_MORE_THAN_ONE)
    .limit(50)
  const places = placeGroups.map((g) => g.key).filter((k): k is string => Boolean(k))
  const phones = phoneGroups.map((g) => g.key).filter((k): k is string => typeof k === 'string' && k.length === 10)
  if (places.length === 0 && phones.length === 0) return out

  const conds = []
  if (places.length > 0) conds.push(inArray(schema.prospect.googlePlaceId, places))
  if (phones.length > 0) conds.push(inArray(tenDigitPhoneSql(), phones))
  const rows = await db
    .select()
    .from(schema.prospect)
    .where(and(live, or(...conds)))
    .limit(500)

  const pairs = exactDuplicatePairs(rows)
  out.groups = pairs.length
  const gone = new Set<string>()
  for (const [a, b] of pairs) {
    if (out.merged >= cap) break
    if (gone.has(a.id) || gone.has(b.id)) {
      out.skipped++
      continue
    }
    const survivor = chooseSurvivor([a, b])
    if (!survivor) {
      out.skipped++
      continue
    }
    const loser = survivor.id === a.id ? b : a
    try {
      const r = await mergeProspects(survivor.id, loser.id, { now })
      if (r.ok) {
        out.merged++
        gone.add(loser.id)
      } else out.skipped++
    } catch (err) {
      out.errors++
      console.warn('[prospect-dedupe] merge failed', survivor.id, loser.id, err instanceof Error ? err.message : err)
    }
  }
  return out
}

/** Exported for the discovery pre-check: the normalized name the matcher
 *  compares (so discovery and the sweep agree on what "same name" means). */
export { normalizePracticeName }
