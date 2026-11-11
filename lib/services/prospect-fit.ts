import 'server-only'
import { and, eq, inArray, isNotNull, ne, sql, type SQL } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { computeQualityScore, qualityInput } from '@/lib/prospect-quality'
import {
  CHAIN_SHARED_THRESHOLD,
  chainFlaggable,
  chainGroupVerdict,
  chainRestoreStatus,
  chainSentence,
  fitVerdict,
  type ChainGroup,
  type ChainKind,
} from '@/lib/prospect-fit'
import { parseVerification, type ProspectFitSignals, type ProspectVerification } from '@/lib/types/prospecting'
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
 *                    Runs on the hygiene tick (the enrich cron), fail-open.
 *   clearChainFlag   the drawer's "Not a chain": the owner's override is
 *                    stored (`fit.chainOverride`, never re-flagged) and the
 *                    row returns to where it was.
 *   countChains      the hunt tile and the table chip.
 *
 * Every raw fragment is rendered through the real dialect in
 * tests/prospecting/hygiene-sql.test.ts.
 */

const p = schema.prospect

/** The website's host, in SQL: "https://www.smile.com/x" → "smile.com". */
export function websiteHostSql(): SQL<string> {
  return sql<string>`lower(regexp_replace(regexp_replace(${p.websiteUrl}, '^https?://', ''), '^(www\\.)?([^/:?#]+).*$', '\\2'))`
}

/** The address key the chain rule counts DISTINCT addresses by: street +
 *  ZIP, letters and digits only. */
export function addressKeySql(): SQL<string> {
  return sql<string>`lower(regexp_replace(coalesce(${p.addressLine1}, '') || coalesce(${p.postalCode}, ''), '[^a-zA-Z0-9]', '', 'g'))`
}

/** HAVING count(distinct address) >= the chain threshold. */
export function chainGroupHaving(threshold = CHAIN_SHARED_THRESHOLD): SQL {
  // A cast parameter, never an untyped $n (the autonomy-sql lesson).
  return sql`count(distinct ${addressKeySql()}) >= ${threshold}::int`
}

/** The statuses the group query reads: every row that is a practice of
 *  ours to judge — never a merged shell, never a customer. */
function groupable(): SQL | undefined {
  return and(ne(p.status, 'merged'), ne(p.status, 'converted'))
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
    .where(and(groupable(), isNotNull(p.websiteUrl)))
    .groupBy(host)
    .having(chainGroupHaving(threshold))
  const phones = await db
    .select({ key: phone, addresses, ids })
    .from(p)
    .where(and(groupable(), isNotNull(p.phone), sql`${phone} <> ''`))
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
  errors: number
}

async function flagMember(
  row: { id: string; status: string; suppressedReason: string | null; verification: unknown },
  group: ChainGroup,
  now: Date,
): Promise<'flagged' | 'noted' | 'skipped'> {
  const verification = parseVerification(row.verification)
  const fit: ProspectFitSignals = { ...(verification.fit ?? {}) }
  // The owner said "Not a chain": never re-flagged, nothing written.
  if (fit.chainOverride) return 'skipped'
  const already = row.status === 'disqualified' && row.suppressedReason === 'chain'
  const sentence = chainSentence({ chain: { kind: group.kind, count: group.ids.length } })
  fit.chain = {
    status: group.kind,
    detail: sentence,
    checkedAt: now.toISOString(),
    source: 'our_data',
    kind: group.kind,
    count: group.ids.length,
    key: group.key,
    priorStatus: fit.chain?.priorStatus ?? (already ? null : row.status),
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
  // stops, the system follow-up clears, the caller's slot frees.
  await stopActiveEnrollments(row.id, 'verify_chain', now)
  await clearSystemFollowUp(row.id, now)
  await releaseIfUnservable(row.id, now)
  return 'flagged'
}

/**
 * The chain sweep — every member of every group over the threshold.
 * Idempotent: a row already set aside as a chain only refreshes its signal;
 * an overridden row is never touched. Each member's write is its own
 * try/catch so one bad row never stops the rest.
 */
export async function sweepChains(opts: { now?: Date; threshold?: number } = {}): Promise<ChainSweepResult> {
  const now = opts.now ?? new Date()
  const out: ChainSweepResult = { groups: 0, flagged: 0, noted: 0, errors: 0 }
  const groups = await findChainGroups(opts.threshold ?? CHAIN_SHARED_THRESHOLD)
  out.groups = groups.length
  for (const g of groups) {
    if (g.ids.length === 0) continue
    const members = await db
      .select({ id: p.id, status: p.status, suppressedReason: p.suppressedReason, verification: p.verification })
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
  return out
}

/**
 * "Not a chain" — the owner's override. Stored on the row for good (the
 * verify pass and the sweep both read it first), the row returns to the
 * status it had before the flag (else `enriched`), and its quality is
 * recomputed from the stored signals when the pass has looked at it.
 */
export async function clearChainFlag(
  prospectId: string,
  now: Date = new Date(),
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
  if (!flaggedNow && !fitVerdict(verification.fit).chain) return { ok: false, reason: 'not_flagged' }
  const fit: ProspectFitSignals = {
    ...(verification.fit ?? {}),
    chainOverride: {
      status: 'not_a_chain',
      detail: 'Marked "not a chain" by hand — never flagged again',
      checkedAt: now.toISOString(),
      source: 'owner',
    },
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
  }
  await db
    .update(p)
    .set(patch)
    .where(and(eq(p.id, prospectId), ne(p.status, 'merged')))
  return { ok: true, status }
}

/** Rows set aside as a chain / DSO — the hunt tile and the table chip. */
export async function countChains(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(p)
    .where(and(eq(p.status, 'disqualified'), eq(p.suppressedReason, 'chain')))
  return row?.n ?? 0
}
