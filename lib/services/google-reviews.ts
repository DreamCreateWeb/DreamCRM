import 'server-only'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { resolveGbpAccount } from '@/lib/services/zernio'
import {
  listGoogleReviews as zernioListGoogleReviews,
  replyToGoogleReview as zernioReplyToGoogleReview,
  deleteGoogleReviewReply as zernioDeleteGoogleReviewReply,
  type GoogleReview,
} from '@/lib/zernio'

/**
 * Google Business reviews service. The Reviews module's SECOND source — REAL
 * reviews patients left on Google, pulled through the clinic's Zernio GBP
 * connection. Distinct from the first-party `review_request` flow (which we own
 * the text of): these we mirror + reply to from the dashboard, and the synced
 * rating feeds the public-site `AggregateRating` JSON-LD (real Google data only,
 * never fabricated).
 *
 * Demo-safe: a connection flagged `isDemo` NEVER hits the network — every
 * function short-circuits to (or persists locally against) the seeded synthetic
 * rows. Best-effort: a pull failure records nothing destructive.
 */

const GOOGLE_BUSINESS = 'googlebusiness'
// Cap pages per sync so a runaway pageToken loop can't hang the cron.
const MAX_SYNC_PAGES = 10

// ── Row → view shape ──────────────────────────────────────────────────────────

export interface GoogleReviewView {
  id: string
  externalReviewId: string
  reviewerName: string | null
  reviewerPhotoUrl: string | null
  /** Integer 1–5, or null (Google allows rating-only / comment-only). */
  starRating: number | null
  comment: string | null
  reviewCreatedAt: Date | null
  reviewUpdatedAt: Date | null
  replyComment: string | null
  replyUpdatedAt: Date | null
}

export interface GoogleReviewStats {
  /** How many synced Google reviews carry a real 1–5 rating (drives the
   *  AggregateRating reviewCount — Google requires both value + count). */
  count: number
  /** Mean of those ratings, rounded to 1 decimal. Null when count is 0. */
  averageRating: number | null
  /** Reviews still awaiting an owner reply (drives the dashboard nudge). */
  needsReply: number
}

function toView(r: schema.GoogleReviewRow): GoogleReviewView {
  return {
    id: r.id,
    externalReviewId: r.externalReviewId,
    reviewerName: r.reviewerName,
    reviewerPhotoUrl: r.reviewerPhotoUrl,
    starRating: r.starRating,
    comment: r.comment,
    reviewCreatedAt: r.reviewCreatedAt,
    reviewUpdatedAt: r.reviewUpdatedAt,
    replyComment: r.replyComment,
    replyUpdatedAt: r.replyUpdatedAt,
  }
}

// ── Connection resolution ─────────────────────────────────────────────────────
// The org→GBP-account resolver lives in `lib/services/zernio.ts` (shared with
// gbp-sync.ts + gbp-metrics.ts); imported above as `resolveGbpAccount`.

/** Whether the org has a connected GBP (demo or real). Used by the UI to choose
 *  between the reviews surface and the connect-prompt empty state. */
export async function hasGoogleBusinessConnection(orgId: string): Promise<boolean> {
  return (await resolveGbpAccount(orgId)) !== null
}

// ── Sync ──────────────────────────────────────────────────────────────────────

function parseDate(iso: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function newReviewRowId(): string {
  return `gr_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

/** Idempotent upsert of one pulled review by (orgId, externalReviewId). Updates
 *  mutable fields (comment edits, rating changes, new/edited owner replies). */
async function upsertReview(
  orgId: string,
  accountId: string,
  r: GoogleReview,
  isDemo: number,
): Promise<void> {
  const now = new Date()
  await db
    .insert(schema.platformReview)
    .values({
      id: newReviewRowId(),
      organizationId: orgId,
      platform: GOOGLE_BUSINESS,
      externalReviewId: r.id,
      accountId,
      reviewerName: r.reviewerName,
      reviewerPhotoUrl: r.reviewerPhotoUrl,
      starRating: r.starRating,
      comment: r.comment,
      reviewCreatedAt: parseDate(r.createTime),
      reviewUpdatedAt: parseDate(r.updateTime),
      replyComment: r.replyComment,
      replyUpdatedAt: parseDate(r.replyUpdateTime),
      isDemo,
    })
    .onConflictDoUpdate({
      target: [
        schema.platformReview.organizationId,
        schema.platformReview.platform,
        schema.platformReview.externalReviewId,
      ],
      set: {
        accountId,
        reviewerName: r.reviewerName,
        reviewerPhotoUrl: r.reviewerPhotoUrl,
        starRating: r.starRating,
        comment: r.comment,
        reviewCreatedAt: parseDate(r.createTime),
        reviewUpdatedAt: parseDate(r.updateTime),
        // Only overwrite the reply when THIS pull carries one. A reply the
        // clinic just posted (persisted locally + shown immediately) often
        // hasn't propagated back into the pulled payload yet — writing the
        // pulled null here would wipe it from the dashboard until Google
        // catches up. When the pull has no reply, leave the stored value alone.
        ...(r.replyComment != null
          ? { replyComment: r.replyComment, replyUpdatedAt: parseDate(r.replyUpdateTime) }
          : {}),
        updatedAt: now,
      },
    })
}

export interface SyncGoogleReviewsResult {
  ok: boolean
  /** Reviews pulled + upserted this run. */
  synced: number
  /** Set when the org has no connected GBP (not an error — caller decides). */
  skipped?: 'no_connection' | 'demo'
  error?: string
}

/**
 * Pull the org's Google reviews via Zernio and idempotently upsert them. Pages
 * through `nextPageToken` (capped). DEMO connections never touch the network —
 * the seeded rows stand and we report `skipped:'demo'`. On API failure we record
 * nothing destructive and surface `ok:false` with the error (callers catch).
 */
export async function syncGoogleReviews(orgId: string): Promise<SyncGoogleReviewsResult> {
  const account = await resolveGbpAccount(orgId)
  if (!account) return { ok: true, synced: 0, skipped: 'no_connection' }
  if (account.isDemo) return { ok: true, synced: 0, skipped: 'demo' }

  let synced = 0
  let pageToken: string | undefined
  try {
    for (let page = 0; page < MAX_SYNC_PAGES; page++) {
      const { reviews, nextPageToken } = await zernioListGoogleReviews({
        accountId: account.accountId,
        pageToken,
      })
      for (const r of reviews) {
        await upsertReview(orgId, account.accountId, r, 0)
        synced++
      }
      if (!nextPageToken) break
      pageToken = nextPageToken
    }
    return { ok: true, synced }
  } catch (e) {
    return { ok: false, synced, error: (e as Error).message }
  }
}

// ── Reads for the UI ──────────────────────────────────────────────────────────

/** Every synced Google review for the org, newest first. Scoped to the Google
 *  platform — Facebook reviews live in the same table but read through
 *  `lib/services/facebook-reviews.ts`. */
export async function listGoogleReviews(orgId: string, limit = 100): Promise<GoogleReviewView[]> {
  const rows = await db
    .select()
    .from(schema.platformReview)
    .where(
      and(
        eq(schema.platformReview.organizationId, orgId),
        eq(schema.platformReview.platform, GOOGLE_BUSINESS),
      ),
    )
    .orderBy(
      desc(sql`COALESCE(${schema.platformReview.reviewCreatedAt}, ${schema.platformReview.createdAt})`),
    )
    .limit(limit)
  return rows.map(toView)
}

/**
 * Aggregate rating stats over the org's synced Google reviews. Only reviews
 * that carry a real 1–5 rating count toward the average + count (a comment-only
 * review must not drag the AggregateRating). Average rounded to 1 decimal.
 */
export async function getGoogleReviewStats(orgId: string): Promise<GoogleReviewStats> {
  const rows = await db
    .select({ starRating: schema.platformReview.starRating, replyComment: schema.platformReview.replyComment })
    .from(schema.platformReview)
    .where(
      and(
        eq(schema.platformReview.organizationId, orgId),
        eq(schema.platformReview.platform, GOOGLE_BUSINESS),
      ),
    )

  let sum = 0
  let count = 0
  let needsReply = 0
  for (const r of rows) {
    if (typeof r.starRating === 'number' && r.starRating >= 1 && r.starRating <= 5) {
      sum += r.starRating
      count++
    }
    if (!r.replyComment) needsReply++
  }
  const averageRating = count > 0 ? Math.round((sum / count) * 10) / 10 : null
  return { count, averageRating, needsReply }
}

// ── Reply / delete-reply ──────────────────────────────────────────────────────

async function loadReview(
  orgId: string,
  externalReviewId: string,
): Promise<schema.PlatformReviewRow | null> {
  const [row] = await db
    .select()
    .from(schema.platformReview)
    .where(
      and(
        eq(schema.platformReview.organizationId, orgId),
        eq(schema.platformReview.platform, GOOGLE_BUSINESS),
        eq(schema.platformReview.externalReviewId, externalReviewId),
      ),
    )
    .limit(1)
  return row ?? null
}

/**
 * Post (or overwrite) the clinic's reply to a Google review. Calls Zernio for a
 * real connection, then persists `replyComment` + `replyUpdatedAt` locally so
 * the dashboard reflects it immediately. DEMO connections persist locally only
 * (never network). Returns `{ ok }` so the server action can surface inline.
 */
export async function replyToGoogleReview(
  orgId: string,
  externalReviewId: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const comment = text.trim()
  if (!comment) return { ok: false, error: 'Write a reply before posting.' }
  if (comment.length > 4096) return { ok: false, error: 'Replies must be 4096 characters or fewer.' }

  const review = await loadReview(orgId, externalReviewId)
  if (!review) return { ok: false, error: 'That review is no longer available.' }

  if (review.isDemo !== 1) {
    const account = await resolveGbpAccount(orgId)
    if (!account) return { ok: false, error: 'Connect your Google Business Profile to reply.' }
    try {
      await zernioReplyToGoogleReview({ accountId: account.accountId, reviewId: externalReviewId, comment })
    } catch (e) {
      return { ok: false, error: `Google rejected the reply: ${(e as Error).message}` }
    }
  }

  const now = new Date()
  await db
    .update(schema.platformReview)
    .set({ replyComment: comment, replyUpdatedAt: now, updatedAt: now })
    .where(
      and(
        eq(schema.platformReview.organizationId, orgId),
        eq(schema.platformReview.platform, GOOGLE_BUSINESS),
        eq(schema.platformReview.externalReviewId, externalReviewId),
      ),
    )
  return { ok: true }
}

/**
 * Remove the clinic's reply from a Google review. Calls Zernio for a real
 * connection (best-effort), then clears the reply locally. DEMO connections
 * clear locally only.
 */
export async function deleteGoogleReviewReply(
  orgId: string,
  externalReviewId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const review = await loadReview(orgId, externalReviewId)
  if (!review) return { ok: false, error: 'That review is no longer available.' }

  if (review.isDemo !== 1) {
    const account = await resolveGbpAccount(orgId)
    if (!account) return { ok: false, error: 'Connect your Google Business Profile to manage replies.' }
    try {
      await zernioDeleteGoogleReviewReply({ accountId: account.accountId, reviewId: externalReviewId })
    } catch (e) {
      return { ok: false, error: `Google rejected the deletion: ${(e as Error).message}` }
    }
  }

  const now = new Date()
  await db
    .update(schema.platformReview)
    .set({ replyComment: null, replyUpdatedAt: null, updatedAt: now })
    .where(
      and(
        eq(schema.platformReview.organizationId, orgId),
        eq(schema.platformReview.platform, GOOGLE_BUSINESS),
        eq(schema.platformReview.externalReviewId, externalReviewId),
      ),
    )
  return { ok: true }
}

// ── Cron helper ───────────────────────────────────────────────────────────────

/**
 * Sync every org with a connected, NON-demo Google Business account. Driven by
 * the `/api/cron/sync-google-reviews` route. Each org is best-effort — one
 * failure never aborts the batch.
 */
export async function syncAllGoogleReviews(): Promise<{
  scanned: number
  synced: number
  failed: number
  errors: Array<{ organizationId: string; error: string }>
}> {
  // Orgs with a connected GBP account that ISN'T the demo. We read connection
  // rows joined to accounts so we only touch orgs that actually have a GBP.
  const conns = await db
    .select({ organizationId: schema.zernioConnection.organizationId, isDemo: schema.zernioConnection.isDemo })
    .from(schema.zernioConnection)
    .where(and(eq(schema.zernioConnection.status, 'connected'), eq(schema.zernioConnection.isDemo, 0)))

  const result = { scanned: 0, synced: 0, failed: 0, errors: [] as Array<{ organizationId: string; error: string }> }
  for (const conn of conns) {
    result.scanned++
    try {
      const r = await syncGoogleReviews(conn.organizationId)
      if (r.ok) result.synced += r.synced
      else {
        result.failed++
        result.errors.push({ organizationId: conn.organizationId, error: r.error ?? 'unknown' })
      }
    } catch (e) {
      result.failed++
      result.errors.push({ organizationId: conn.organizationId, error: (e as Error).message })
    }
  }
  return result
}

// ── Demo seeding ──────────────────────────────────────────────────────────────

/** Synthetic Google reviews for the demo (Dream Dental). Varied ratings incl.
 *  a couple 5★, one 4★, one already-replied, one rating-only (null comment) —
 *  so /reviews/received, the dashboard stats, AND the public AggregateRating all
 *  showcase populated state. Never networks. */
interface DemoReviewSeed {
  externalReviewId: string
  reviewerName: string
  reviewerPhotoUrl: string | null
  starRating: number | null
  comment: string | null
  daysAgo: number
  replyComment: string | null
  replyDaysAgo: number | null
}

const DEMO_GOOGLE_REVIEWS: DemoReviewSeed[] = [
  {
    externalReviewId: 'demo_gr_1',
    reviewerName: 'Priya Nair',
    reviewerPhotoUrl: null,
    starRating: 5,
    comment:
      "Best dental experience I've had in years. The whole team is warm, the office is spotless, and Dr. Reyes actually explained my options instead of just handing me a bill. Highly recommend.",
    daysAgo: 3,
    replyComment:
      'Thank you so much, Priya! It genuinely makes our day to hear this. See you at your next cleaning. — The Dream Dental team',
    replyDaysAgo: 2,
  },
  {
    externalReviewId: 'demo_gr_2',
    reviewerName: 'Marcus Bell',
    reviewerPhotoUrl: null,
    starRating: 5,
    comment:
      'Booked online on a Sunday night and got in Tuesday morning. Front desk handled my insurance without me lifting a finger. Painless filling, no upsell. This is how a dentist should run.',
    daysAgo: 9,
    replyComment: null,
    replyDaysAgo: null,
  },
  {
    externalReviewId: 'demo_gr_3',
    reviewerName: 'Sofia Delgado',
    reviewerPhotoUrl: null,
    starRating: 5,
    comment:
      'My kids actually ask when their next visit is. The hygienists are so patient and kind with anxious little ones. We drive past two closer offices to come here.',
    daysAgo: 16,
    replyComment:
      "That means the world to us, Sofia — we love seeing the kids! Thanks for making the drive. — Dream Dental",
    replyDaysAgo: 15,
  },
  {
    externalReviewId: 'demo_gr_4',
    reviewerName: 'Daniel Okafor',
    reviewerPhotoUrl: null,
    starRating: 4,
    comment:
      'Great care and a friendly team. Only reason for 4 stars is the wait was a little long on my last visit, but the work itself was excellent and they kept me updated.',
    daysAgo: 24,
    replyComment: null,
    replyDaysAgo: null,
  },
  {
    externalReviewId: 'demo_gr_5',
    reviewerName: 'Hannah Weiss',
    reviewerPhotoUrl: null,
    starRating: 5,
    comment:
      "I came in terrified after a bad experience elsewhere. They never made me feel judged for putting it off. Gentle, honest, and they walked me through every step. Forever a patient now.",
    daysAgo: 31,
    replyComment: null,
    replyDaysAgo: null,
  },
  {
    // Rating-only review (no comment) — exercises the null-comment render path
    // and confirms it still counts toward the AggregateRating.
    externalReviewId: 'demo_gr_6',
    reviewerName: 'Trevor Lin',
    reviewerPhotoUrl: null,
    starRating: 5,
    comment: null,
    daysAgo: 40,
    replyComment: null,
    replyDaysAgo: null,
  },
]

/**
 * Seed (or self-heal) the demo clinic's synthetic Google reviews so the Reviews
 * surfaces + the public AggregateRating showcase populated state. Idempotent
 * (upsert by externalReviewId). Scoped to the isDemo org by the caller; behind a
 * real-patient guard so an exhausted/empty context can't spawn orphan rows
 * (mirrors `seedDemoZernio` / `seedDemoPms`). NEVER networks.
 */
export async function seedDemoGoogleReviews(organizationId: string): Promise<void> {
  // Prerequisite guard — only seed for a real demo org (one with patients).
  const [anyPatient] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, organizationId))
    .limit(1)
  if (!anyPatient) return

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  for (const seed of DEMO_GOOGLE_REVIEWS) {
    const createdAt = new Date(now - seed.daysAgo * dayMs)
    const replyAt = seed.replyDaysAgo != null ? new Date(now - seed.replyDaysAgo * dayMs) : null
    await db
      .insert(schema.platformReview)
      .values({
        id: `gr_demo_${seed.externalReviewId}`,
        organizationId,
        platform: GOOGLE_BUSINESS,
        externalReviewId: seed.externalReviewId,
        accountId: 'demo_gbp_dream_dental',
        reviewerName: seed.reviewerName,
        reviewerPhotoUrl: seed.reviewerPhotoUrl,
        starRating: seed.starRating,
        comment: seed.comment,
        reviewCreatedAt: createdAt,
        reviewUpdatedAt: createdAt,
        replyComment: seed.replyComment,
        replyUpdatedAt: replyAt,
        isDemo: 1,
      })
      .onConflictDoNothing()
  }
}
