import 'server-only'
import { and, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm'
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
import { wakeStatus } from '@/lib/prospect-decay'
import type { DuplicateCandidate, ProspectStatus } from '@/lib/types/prospecting'

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

/** Rendered by the boundary test — the one raw fragment the sweep's
 *  group-by uses. */
export const HAVING_MORE_THAN_ONE = sql`count(*) > 1`

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
  if (keys.phone) conds.push(eq(schema.prospect.phone, keys.phone))
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
 *  never a unique key (npi, dedupe hash), never the audit stamps. */
const FILL_COLUMNS = [
  'npiNumber',
  'addressLine1',
  'city',
  'state',
  'postalCode',
  'phone',
  'phoneStatus',
  'phoneLineType',
  'phoneSource',
  'phoneValidatedAt',
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

export type MergeRefusal = { ok: false; reason: 'not_found' | 'same_row' | 'already_merged' | 'loser_converted' }

/**
 * Fold `loserId` into `survivorId`. The caller picked the survivor
 * (`chooseSurvivor` / the drawer); this only refuses the impossible.
 */
export async function mergeProspects(
  survivorId: string,
  loserId: string,
  opts: { now?: Date } = {},
): Promise<MergeResult | MergeRefusal> {
  if (survivorId === loserId) return { ok: false, reason: 'same_row' }
  const rows = await db.select().from(schema.prospect).where(inArray(schema.prospect.id, [survivorId, loserId]))
  const survivor = rows.find((r) => r.id === survivorId)
  const loser = rows.find((r) => r.id === loserId)
  if (!survivor || !loser) return { ok: false, reason: 'not_found' }
  if (survivor.status === 'merged' || loser.status === 'merged') return { ok: false, reason: 'already_merged' }
  if (loser.status === 'converted') return { ok: false, reason: 'loser_converted' }
  const now = opts.now ?? new Date()
  const moved: Record<string, number> = {}

  await db.transaction(async (tx: Tx) => {
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

    // ── Enrollments: one LIVE drip per prospect ──────────────────────────
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
    if (survivorLive) {
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
      if (survivor[col] == null && loser[col] != null) (patch as Record<string, unknown>)[col] = loser[col]
    }
    // The nearer promised follow-up wins — a callback is a promise.
    if (survivor.nextFollowUpAt && loser.nextFollowUpAt && loser.nextFollowUpAt < survivor.nextFollowUpAt) {
      patch.nextFollowUpAt = loser.nextFollowUpAt
      patch.followUpReason = loser.followUpReason
    }
    const loserStatus = loser.status === 'dormant' ? wakeStatus(loser.dormantFromStatus) : loser.status
    const loserRank = STATUS_RANK[loserStatus]
    const survivorRank = STATUS_RANK[survivor.status]
    if (
      survivor.status !== 'converted' &&
      loserRank !== undefined &&
      survivorRank !== undefined &&
      loserRank > survivorRank
    ) {
      patch.status = loserStatus
      patch.dormantFromStatus = null
      if (survivorRank <= STATUS_RANK.enriched && loser.intentAt) {
        patch.intentSignal = loser.intentSignal
        patch.intentAt = loser.intentAt
        patch.intentSummary = loser.intentSummary
        patch.talkingPoints = loser.talkingPoints
      }
    }
    await tx.update(schema.prospect).set(patch).where(eq(schema.prospect.id, survivorId))

    // ── The loser rests under its survivor, nothing deleted ──────────────
    await tx
      .update(schema.prospect)
      .set({
        status: 'merged',
        mergedIntoProspectId: survivorId,
        dormantFromStatus: null,
        nextFollowUpAt: null,
        followUpReason: null,
        updatedAt: now,
      })
      .where(eq(schema.prospect.id, loserId))
  })

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
): Promise<MergeResult | MergeRefusal | { ok: false; reason: 'both_converted' }> {
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
  const phoneGroups = await db
    .select({ key: schema.prospect.phone })
    .from(schema.prospect)
    .where(and(live, isNotNull(schema.prospect.phone)))
    .groupBy(schema.prospect.phone)
    .having(HAVING_MORE_THAN_ONE)
    .limit(50)
  const places = placeGroups.map((g) => g.key).filter((k): k is string => Boolean(k))
  const phones = phoneGroups.map((g) => g.key).filter((k): k is string => Boolean(k))
  if (places.length === 0 && phones.length === 0) return out

  const conds = []
  if (places.length > 0) conds.push(inArray(schema.prospect.googlePlaceId, places))
  if (phones.length > 0) conds.push(inArray(schema.prospect.phone, phones))
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
