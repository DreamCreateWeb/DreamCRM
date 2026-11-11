import 'server-only'
import { and, desc, eq, inArray, isNotNull, isNull, ne, notExists, notInArray, or, sql, type SQL } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { BAD_PHONE_STATUSES } from '@/lib/db/schema/prospecting'
import { computeQualityScore, qualityInput } from '@/lib/prospect-quality'
import {
  ADDRESS_WORDS,
  CHAIN_SHARED_THRESHOLD,
  SUITE_TOKEN_PATTERN,
  chainFlaggable,
  chainGroupVerdict,
  chainRestoreStatus,
  chainSentence,
  fitVerdict,
  type ChainGroup,
  type ChainKind,
} from '@/lib/prospect-fit'
import { SYSTEM_FOLLOWUP_REASONS } from '@/lib/prospect-followup'
import { parseVerification, type PriorFollowUp, type ProspectFitSignals, type ProspectVerification } from '@/lib/types/prospecting'
import { tenDigitPhoneSql } from './prospect-dedupe'
import { releaseIfUnservable } from './prospect-caller-release'
import { clearSystemFollowUp, getProspectingConfig, stopActiveEnrollments } from './prospecting'

/**
 * FIT — the group work (P-04). The per-row fit read (a DSO name, the
 * practice size, a new practice) lives in the verify pass; what needs the
 * WHOLE table is here:
 *
 *   sweepChains      the same website host or the same phone across ≥3
 *                    prospects at different addresses → every one of them
 *                    is a chain: `fit.chain` stored, status disqualified
 *                    `chain`, the drip stopped, the caller's slot freed.
 *                    Runs on the hygiene tick (the enrich cron), AFTER the
 *                    exact-dedupe merge, fail-open. The same sweep RESTORES
 *                    a row it flagged whose group no longer meets the
 *                    threshold (a duplicate merged, a number corrected) —
 *                    an overridden row and a DSO-named row are never
 *                    touched (fix pass, E.4).
 *   clearChainFlag   the drawer's "Not a chain": the owner's override is
 *                    stored (`fit.chainOverride`, never re-flagged) and the
 *                    row returns to where it was — its drip resumed, the
 *                    system follow-up the flag cleared put back (F.1).
 *   countChains      the hunt tile and the table chip.
 *
 * MEMBERSHIP (E.5): a row disqualified for retired / closed is not a
 * practice any more and never counts toward the distinct-address
 * threshold; a row disqualified AS A CHAIN still does (idempotency); the
 * phone group leaves out a number the row itself says is not its own
 * (`BAD_PHONE_STATUSES`). Addresses are counted by ONE normalized key
 * (`addressKeySql`, the pure twin is `addressKey`): '123 MAIN ST STE 200'
 * and '123 Main Street Suite 200' are one address.
 *
 * Every raw fragment is rendered through the real dialect in
 * tests/prospecting/hygiene-sql.test.ts.
 */

const p = schema.prospect
const enr = schema.outreachEnrollment

/** The stop reason the chain flag puts on a drip — what the restore resumes. */
export const CHAIN_STOP_REASON = 'verify_chain'

/** The statuses a restored row gets its system follow-up back in. */
const FOLLOWUP_RESTORE_STATUSES = new Set(['queued', 'contacted', 'engaged', 'call_list'])

/** The website's host, in SQL: "HTTPS://www.Smile.com/x" → "smile.com" —
 *  the whole value lower-cased FIRST, so an upper-case scheme never
 *  survives the strip and collapses to the host "https" (fix pass, E.3). */
export function websiteHostSql(): SQL<string> {
  return sql<string>`regexp_replace(regexp_replace(lower(${p.websiteUrl}), '^https?://', ''), '^(www\\.)?([^/:?#]+).*$', '\\2')`
}

/**
 * The address key the chain rule counts DISTINCT addresses by — the SQL
 * twin of `addressKey` (lib/prospect-fit.ts), built from the same word
 * table in the same order: lower; the common street (and suite) words
 * folded; the suite / unit / floor token and its value dropped (unless
 * `keepSuite`); ZIP5 only; then letters and digits.
 */
export function addressKeySql(opts: { keepSuite?: boolean } = {}): SQL<string> {
  let s: SQL = sql`lower(coalesce(${p.addressLine1}, ''))`
  for (const [word, abbr] of ADDRESS_WORDS) {
    s = sql`regexp_replace(${s}, ${sql.raw(`'\\m${word}\\M'`)}, ${sql.raw(`'${abbr}'`)}, 'g')`
  }
  if (!opts.keepSuite) {
    s = sql`regexp_replace(${s}, ${sql.raw(`'\\m${SUITE_TOKEN_PATTERN}\\M\\.?\\s*#?\\s*[a-z0-9-]+'`)}, ' ', 'g')`
    s = sql`regexp_replace(${s}, '#\\s*[a-z0-9-]+', ' ', 'g')`
  }
  const zip = sql`left(regexp_replace(coalesce(${p.postalCode}, ''), '\\D', '', 'g'), 5)`
  return sql<string>`regexp_replace(${s} || ${zip}, '[^a-z0-9]', '', 'g')`
}

/** HAVING count(distinct address) >= the chain threshold. */
export function chainGroupHaving(threshold = CHAIN_SHARED_THRESHOLD): SQL {
  // A cast parameter, never an untyped $n (the autonomy-sql lesson).
  return sql`count(distinct ${addressKeySql()}) >= ${threshold}::int`
}

/** The statuses the group query reads: every row that is a practice of
 *  ours to judge — never a merged shell, never a customer, never a row
 *  disqualified for retired / closed (not a practice any more). A row
 *  disqualified AS A CHAIN still counts, so a flagged group stays a group. */
export function chainGroupableWhere(): SQL {
  return and(
    ne(p.status, 'merged'),
    ne(p.status, 'converted'),
    or(ne(p.status, 'disqualified'), isNull(p.suppressedReason), notInArray(p.suppressedReason, ['retired', 'closed'])),
  ) as SQL
}

/** The phone group's members: groupable, with a number, and never a number
 *  the row itself says is not its own. */
export function chainPhoneGroupWhere(): SQL {
  return and(
    chainGroupableWhere(),
    isNotNull(p.phone),
    sql`${tenDigitPhoneSql()} <> ''`,
    or(isNull(p.phoneStatus), notInArray(p.phoneStatus, [...BAD_PHONE_STATUSES])),
  ) as SQL
}

/** The shared-host and shared-phone groups at or over the threshold. The
 *  verdict (lib/prospect-fit.ts) still drops a generic host. */
export async function findChainGroups(threshold = CHAIN_SHARED_THRESHOLD): Promise<ChainGroup[]> {
  const host = websiteHostSql()
  const phone = tenDigitPhoneSql()
  const addresses = sql<number>`count(distinct ${addressKeySql()})::int`
  const ids = sql<string[]>`array_agg(${p.id})`
  const hosts = await db
    .select({ key: host, addresses, ids })
    .from(p)
    .where(and(chainGroupableWhere(), isNotNull(p.websiteUrl)))
    .groupBy(host)
    .having(chainGroupHaving(threshold))
  const phones = await db
    .select({ key: phone, addresses, ids })
    .from(p)
    .where(chainPhoneGroupWhere())
    .groupBy(phone)
    .having(chainGroupHaving(threshold))
  const groups: ChainGroup[] = []
  const push = (kind: ChainKind, rows: Array<{ key: string | null; addresses: number; ids: unknown }>) => {
    for (const r of rows) {
      if (!r.key) continue
      const list = Array.isArray(r.ids) ? r.ids.filter((v): v is string => typeof v === 'string') : []
      const g: ChainGroup = { kind, key: r.key, addresses: Number(r.addresses) || 0, ids: list }
      if (chainGroupVerdict(g, threshold)) groups.push(g)
    }
  }
  push('shared_host', hosts)
  push('shared_phone', phones)
  return groups
}

export interface ChainSweepResult {
  groups: number
  /** Rows newly set aside as a chain this run. */
  flagged: number
  /** Rows that recorded the signal but kept their status (a customer, a
   *  row that already said no, an overridden one). */
  noted: number
  /** Rows the sweep flagged earlier whose group fell under the threshold —
   *  restored to where they were. */
  restored: number
  errors: number
}

/** The system follow-up a flag is about to clear, remembered on the signal. */
export function priorFollowUpOf(row: { nextFollowUpAt?: Date | null; followUpReason?: string | null }): PriorFollowUp | null {
  if (!row.nextFollowUpAt || !row.followUpReason) return null
  if (!SYSTEM_FOLLOWUP_REASONS.includes(row.followUpReason)) return null
  return { at: row.nextFollowUpAt.toISOString(), reason: row.followUpReason }
}

async function flagMember(
  row: { id: string; status: string; suppressedReason: string | null; verification: unknown; nextFollowUpAt?: Date | null; followUpReason?: string | null },
  group: ChainGroup,
  now: Date,
): Promise<'flagged' | 'noted' | 'skipped'> {
  const verification = parseVerification(row.verification)
  const fit: ProspectFitSignals = { ...(verification.fit ?? {}) }
  // The owner said "Not a chain": never re-flagged, nothing written.
  if (fit.chainOverride) return 'skipped'
  const already = row.status === 'disqualified' && row.suppressedReason === 'chain'
  const sentence = chainSentence({ chain: { kind: group.kind, count: group.ids.length } })
  // A fresh flag remembers where the row IS now; a refresh of an existing
  // flag keeps what it remembered (never a stale status from an earlier
  // flag that was since lifted).
  const priorStatus = already ? (fit.chain?.priorStatus ?? null) : row.status
  const priorFollowUp = already ? (fit.chain?.priorFollowUp ?? null) : priorFollowUpOf(row)
  fit.chain = {
    status: group.kind,
    detail: sentence,
    checkedAt: now.toISOString(),
    source: 'our_data',
    kind: group.kind,
    count: group.ids.length,
    key: group.key,
    priorStatus,
    ...(priorFollowUp ? { priorFollowUp } : {}),
  }
  const next: ProspectVerification = { ...verification, fit }
  const flag = !already && chainFlaggable(row.status)
  await db
    .update(p)
    .set({
      verification: next,
      updatedAt: now,
      ...(flag
        ? {
            status: 'disqualified',
            suppressedReason: 'chain',
            suppressedAt: now,
            qualityScore: 0,
            qualityBand: 'parked',
            qualityReasons: [sentence],
          }
        : {}),
    })
    .where(and(eq(p.id, row.id), ne(p.status, 'merged')))
  if (!flag) return 'noted'
  // The same hold a verify pass puts on a disqualified practice: the drip
  // stops, the system follow-up clears, the caller's slot frees. (A resting
  // row keeps its `dormant_from_status`, so the restore wakes it to where
  // it came from.)
  await stopActiveEnrollments(row.id, CHAIN_STOP_REASON, now)
  await clearSystemFollowUp(row.id, now)
  await releaseIfUnservable(row.id, now)
  return 'flagged'
}

/**
 * The chain sweep — every member of every group over the threshold, then
 * the un-flag: a row THIS sweep set aside (fit.chain shared_host /
 * shared_phone, no override, no DSO name) that no group holds any more is
 * restored. Idempotent: a row already set aside as a chain only refreshes
 * its signal; an overridden row is never touched. Each member's write is
 * its own try/catch so one bad row never stops the rest.
 */
export async function sweepChains(opts: { now?: Date; threshold?: number } = {}): Promise<ChainSweepResult> {
  const now = opts.now ?? new Date()
  const out: ChainSweepResult = { groups: 0, flagged: 0, noted: 0, restored: 0, errors: 0 }
  const groups = await findChainGroups(opts.threshold ?? CHAIN_SHARED_THRESHOLD)
  out.groups = groups.length
  for (const g of groups) {
    if (g.ids.length === 0) continue
    const members = await db
      .select({
        id: p.id,
        status: p.status,
        suppressedReason: p.suppressedReason,
        verification: p.verification,
        nextFollowUpAt: p.nextFollowUpAt,
        followUpReason: p.followUpReason,
      })
      .from(p)
      .where(inArray(p.id, g.ids))
    for (const m of members) {
      try {
        const r = await flagMember(m, g, now)
        if (r === 'flagged') out.flagged++
        else if (r === 'noted') out.noted++
      } catch (err) {
        out.errors++
        console.warn('[prospect-fit] chain flag failed', m.id, err instanceof Error ? err.message : err)
      }
    }
  }
  // The un-flag: a sweep flag whose evidence is gone.
  const held = new Set(groups.flatMap((g) => g.ids))
  const flagged = await db
    .select({ id: p.id, verification: p.verification })
    .from(p)
    .where(and(eq(p.status, 'disqualified'), eq(p.suppressedReason, 'chain')))
    .limit(500)
  for (const r of flagged) {
    if (held.has(r.id)) continue
    const fit = parseVerification(r.verification).fit
    if (!fit?.chain || (fit.chain.status !== 'shared_host' && fit.chain.status !== 'shared_phone')) continue
    if (fit.chainOverride || fit.dso?.status === 'match') continue
    try {
      const res = await restoreChainFlagged(r.id, now, 'sweep')
      if (res.ok) out.restored++
    } catch (err) {
      out.errors++
      console.warn('[prospect-fit] chain restore failed', r.id, err instanceof Error ? err.message : err)
    }
  }
  return out
}

/** The WHERE of the resume: the LATEST drip the chain flag stopped on this
 *  prospect, and only while no live drip exists (the one-live-enrollment
 *  index). Rendered for real in hygiene-sql.test.ts. */
export function chainResumeWhere(prospectId: string): SQL {
  const latest = db
    .select({ id: enr.id })
    .from(enr)
    .where(and(eq(enr.prospectId, prospectId), eq(enr.status, 'stopped_manual'), eq(enr.stopReason, CHAIN_STOP_REASON)))
    .orderBy(desc(enr.stoppedAt))
    .limit(1)
  const live = db
    .select({ x: sql`1` })
    .from(enr)
    .where(and(eq(enr.prospectId, prospectId), inArray(enr.status, ['active', 'paused_ooo'])))
  return and(inArray(enr.id, latest), notExists(live)) as SQL
}

/** The drip the chain flag stopped goes back to active, its next step from
 *  now — the same resume a lifted verify park gets. Idempotent. */
export async function resumeChainStoppedEnrollment(prospectId: string, now: Date = new Date()): Promise<void> {
  await db
    .update(enr)
    .set({ status: 'active', nextSendAt: now, stoppedAt: null, stopReason: null })
    .where(chainResumeWhere(prospectId))
}

/**
 * THE ONE RESTORE — "Not a chain" (`override`: the owner's override is
 * stored for good) and the sweep's own un-flag (`sweep`: the chain signal
 * reads `cleared`). The row returns to the status it had before the flag
 * (else `enriched`; a resting row returns to resting with its origin
 * intact), its suppression clears, its quality is recomputed from the
 * stored signals when the pass has looked at it, the drip the flag stopped
 * resumes, and the system follow-up the flag cleared is put back (due now
 * if its time has passed).
 */
export async function restoreChainFlagged(
  prospectId: string,
  now: Date = new Date(),
  mode: 'override' | 'sweep' = 'override',
): Promise<{ ok: true; status: string } | { ok: false; reason: 'not_found' | 'merged' | 'not_flagged' }> {
  const [row] = await db
    .select({
      id: p.id,
      status: p.status,
      suppressedReason: p.suppressedReason,
      verification: p.verification,
      verifiedAt: p.verifiedAt,
      phoneStatus: p.phoneStatus,
      phoneLineType: p.phoneLineType,
      businessStatus: p.businessStatus,
      reviewCount: p.reviewCount,
      websiteUrl: p.websiteUrl,
    })
    .from(p)
    .where(eq(p.id, prospectId))
    .limit(1)
  if (!row) return { ok: false, reason: 'not_found' }
  if (row.status === 'merged') return { ok: false, reason: 'merged' }
  const verification = parseVerification(row.verification)
  const flaggedNow = row.status === 'disqualified' && row.suppressedReason === 'chain'
  if (mode === 'sweep' && !flaggedNow) return { ok: false, reason: 'not_flagged' }
  if (mode === 'override' && !flaggedNow && !fitVerdict(verification.fit).chain) return { ok: false, reason: 'not_flagged' }
  const fit: ProspectFitSignals = { ...(verification.fit ?? {}) }
  if (mode === 'override') {
    // An override that arrived through a merge already carries its stamp.
    fit.chainOverride = fit.chainOverride ?? {
      status: 'not_a_chain',
      detail: 'Marked "not a chain" by hand — never flagged again',
      checkedAt: now.toISOString(),
      source: 'owner',
    }
  } else {
    fit.chain = {
      ...(fit.chain ?? {}),
      status: 'cleared',
      detail: 'No longer shares its website or phone with other practices at different addresses — restored',
      checkedAt: now.toISOString(),
      source: 'our_data',
      clearedAt: now.toISOString(),
    }
  }
  const next: ProspectVerification = { ...verification, fit }
  const status = flaggedNow ? chainRestoreStatus(fit.dso?.priorStatus ?? fit.chain?.priorStatus) : row.status
  const patch: Partial<typeof schema.prospect.$inferInsert> = { verification: next, status, updatedAt: now }
  if (flaggedNow) {
    patch.suppressedReason = null
    patch.suppressedAt = null
    if (row.verifiedAt) {
      const config = await getProspectingConfig()
      const q = computeQualityScore(
        qualityInput(
          {
            status,
            verification: next,
            phoneStatus: row.phoneStatus,
            phoneLineType: row.phoneLineType,
            businessStatus: row.businessStatus,
            reviewCount: row.reviewCount,
            websiteUrl: row.websiteUrl,
          },
          config.hygiene,
        ),
      )
      patch.qualityScore = q.score
      patch.qualityBand = q.band
      patch.qualityReasons = q.reasons
    } else {
      patch.qualityScore = null
      patch.qualityBand = null
      patch.qualityReasons = null
    }
    // The system follow-up the flag cleared goes back — due now if its
    // time has passed while the row sat aside.
    const prior = fit.dso?.priorFollowUp ?? fit.chain?.priorFollowUp ?? null
    if (prior && FOLLOWUP_RESTORE_STATUSES.has(status)) {
      const at = new Date(prior.at)
      patch.nextFollowUpAt = Number.isNaN(at.getTime()) || at.getTime() < now.getTime() ? now : at
      patch.followUpReason = prior.reason
    }
  }
  await db
    .update(p)
    .set(patch)
    .where(and(eq(p.id, prospectId), ne(p.status, 'merged')))
  if (flaggedNow) {
    await resumeChainStoppedEnrollment(prospectId, now)
    if (status === 'dormant') {
      // Back to resting: the resting sentence goes back in front, anchored
      // on the last real touch — the hygiene pass's own reconcile.
      const { reconcileDormantAfterVerify } = await import('./prospect-hygiene')
      await reconcileDormantAfterVerify(prospectId, null, now)
    }
  }
  return { ok: true, status }
}

/** "Not a chain" — the owner's override, stored on the row for good (the
 *  verify pass and the sweep both read it first). */
export async function clearChainFlag(
  prospectId: string,
  now: Date = new Date(),
): Promise<{ ok: true; status: string } | { ok: false; reason: 'not_found' | 'merged' | 'not_flagged' }> {
  return restoreChainFlagged(prospectId, now, 'override')
}

/** Rows set aside as a chain / DSO — the hunt tile and the table chip. */
export async function countChains(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(p)
    .where(and(eq(p.status, 'disqualified'), eq(p.suppressedReason, 'chain')))
  return row?.n ?? 0
}
