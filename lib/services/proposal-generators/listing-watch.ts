import 'server-only'
import { and, desc, eq, gte } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { recordAction } from '@/lib/services/action-ledger'
import {
  LISTING_FIELD_NOUN,
  LISTING_FIXABLE_FIELDS,
  type ListingChange,
  type ListingField,
} from '@/lib/gbp-listing-diff'

/**
 * THE LISTING WATCH (ML-35 — the `listing_watch` lane, AUTO + report-only).
 *
 * Google edits a practice's listing on its own — holiday hours, a "suggested"
 * category, a phone from a data partner — and the practice used to find out
 * from a confused patient. The GBP sync already fetches Google's version
 * every hour; it now remembers the last one, and this writer says what moved.
 *
 * WHERE IT RUNS: inside the GBP sync's own cadence, called from
 * `syncGoogleBusinessProfile` right after the snapshot write — NOT the hourly
 * proposal pass (the driver list carries a no-op `listing_watch` step that
 * documents exactly that). It is handed the pure `diffListing` result, so a
 * sync with nothing to say never reaches the database at all.
 *
 * REPORT, NEVER OPERATE. This file imports no Zernio client and writes
 * nothing to Google — pinned by tests/journey/listing-watch.test.ts. The fix
 * stays with `gbp_website_fix`'s ask (website) or the practice's own hand;
 * the entry carries, for the changes the practice can answer inside
 * DreamCRM (hours / phone / website), one quiet door and nothing more.
 *
 * NARRATE ONCE PER CHANGE. One ledger entry per sync that found something,
 * under `listing_watch`, carrying the 'listing' artifact rows (was → now).
 * The dedupe is on the diff's CONTENT, not on time: each change is keyed
 * `field|now`, and a key already narrated in the last 7 days is dropped, so
 * a Google value that flaps back and forth does not re-announce itself every
 * hour, and a staff-clicked "Sync from Google" (which moves the snapshot
 * before the cron sees it) cannot swallow a change either — this runs for
 * every sync, whoever drove it, because the change is GOOGLE's work, not
 * the clinic's.
 */

export const LISTING_WATCH_DEDUPE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export interface ListingWatchDetail {
  /** 'listing' is the Approval Inbox artifact kind; the rows reuse its shape. */
  artifact: 'listing'
  changes: Array<{ field: string; before: string | null; after: string | null }>
  /** `field|now` per change — what the 7-day dedupe reads back. */
  keys: string[]
  openHref: { href: string; label: string } | null
}

/** The key a change dedupes on. */
export function listingChangeKey(c: ListingChange): string {
  return `${c.field}|${c.now}`
}

/** The reader-facing summary: "Google changed your listing's hours: Mon 8–5 → Mon 9–5". */
export function listingWatchSummary(changes: ListingChange[]): string {
  if (changes.length === 1) {
    const c = changes[0]
    const noun = LISTING_FIELD_NOUN[c.field]
    if (c.was == null) return `Google added a ${noun} to your listing: ${c.now}`
    return `Google changed your listing's ${noun}: ${c.was} → ${c.now}`
  }
  const nouns = changes.map((c) => LISTING_FIELD_NOUN[c.field])
  const list = nouns.length === 2 ? nouns.join(' and ') : `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]}`
  return `Google changed your listing's ${list}`
}

/** The one quiet door, or null when nothing here is the practice's to fix. */
export function listingWatchDoor(fields: readonly ListingField[]): { href: string; label: string } | null {
  const fixable = fields.filter((f) => LISTING_FIXABLE_FIELDS.includes(f))
  if (fixable.length === 0) return null
  // A website-only change belongs to the Google workspace (the Website button
  // fix lives there); hours / phone live on the Business profile.
  if (fixable.every((f) => f === 'website')) return { href: '/growth/reviews', label: 'See your Google listing' }
  return { href: '/settings/clinic', label: 'Check your business profile' }
}

/**
 * Narrate what Google moved. Returns how many changes were narrated (0 = said
 * nothing). Never throws: a failed read of the dedupe window narrates nothing
 * rather than risk a double (the next sync carries no diff, so a skipped one
 * is told to the driver's soft-failure strike instead).
 */
export async function generateListingWatch(
  organizationId: string,
  changes: ListingChange[],
  now: Date,
  onSoftFailure?: () => void,
): Promise<number> {
  if (changes.length === 0) return 0

  let seen = new Set<string>()
  try {
    const since = new Date(now.getTime() - LISTING_WATCH_DEDUPE_DAYS * DAY_MS)
    const rows = await db
      .select({ detail: schema.actionLedger.detail })
      .from(schema.actionLedger)
      .where(
        and(
          eq(schema.actionLedger.organizationId, organizationId),
          eq(schema.actionLedger.capability, 'listing_watch'),
          gte(schema.actionLedger.occurredAt, since),
        ),
      )
      .orderBy(desc(schema.actionLedger.occurredAt))
      .limit(100)
    for (const r of rows) {
      const keys = (r.detail as { keys?: unknown } | null)?.keys
      if (Array.isArray(keys)) for (const k of keys) if (typeof k === 'string') seen.add(k)
    }
  } catch (e) {
    console.warn('[listing-watch] dedupe read failed — narrating nothing this sync', e)
    onSoftFailure?.()
    return 0
  }

  const fresh = changes.filter((c) => !seen.has(listingChangeKey(c)))
  if (fresh.length === 0) return 0

  const detail: ListingWatchDetail = {
    artifact: 'listing',
    changes: fresh.map((c) => ({ field: c.field, before: c.was, after: c.now })),
    keys: fresh.map(listingChangeKey),
    openHref: listingWatchDoor(fresh.map((c) => c.field)),
  }
  const ok = await recordAction({
    organizationId,
    capability: 'listing_watch',
    summary: listingWatchSummary(fresh),
    detail: detail as unknown as Record<string, unknown>,
  })
  if (!ok) {
    onSoftFailure?.()
    return 0
  }
  return fresh.length
}
