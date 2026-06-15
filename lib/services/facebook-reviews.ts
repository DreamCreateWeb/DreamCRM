import 'server-only'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getZernioConnection } from '@/lib/services/zernio'
import { listFacebookReviews as zernioListFacebookReviews, type FacebookReview } from '@/lib/zernio'

/**
 * Facebook reviews/recommendations service (Phase 3 PR 4). The Reviews module's
 * THIRD source — REAL recommendations patients left on the clinic's Facebook
 * Page, pulled through the Zernio connection alongside Google reviews. Shares the
 * generalized `platform_review` table (scoped here to `platform='facebook'`).
 *
 * Facebook's model is recommend / don't-recommend, NOT 1–5 stars — so FB rows
 * carry `recommendationType` and `starRating` stays null. They're deliberately
 * EXCLUDED from the public-site AggregateRating (which stays Google-only — the
 * SEO-meaningful, star-shaped rating). Replies are NOT exposed via Zernio for
 * Facebook, so FB recommendations are READ-ONLY here — the UI shows them + a
 * "Reply on Facebook" link-out (honest; no fake reply box).
 *
 * Discipline mirrors `google-reviews.ts`:
 *   - DEMO-SAFE — a connection flagged `isDemo` NEVER hits the network; the
 *     seeded synthetic rows stand.
 *   - BEST-EFFORT — the FB review REST shape is unconfirmed in the rendered docs,
 *     so `syncFacebookReviews` records nothing destructive on any failure and
 *     surfaces `ok:false` + the error; callers catch.
 *   - Idempotent upsert keyed by (orgId, platform='facebook', externalReviewId).
 */

const FACEBOOK = 'facebook'
// Cap pages per sync so a runaway pageToken loop can't hang the cron.
const MAX_SYNC_PAGES = 10

// ── Row → view shape ──────────────────────────────────────────────────────────

export interface FacebookReviewView {
  id: string
  externalReviewId: string
  reviewerName: string | null
  reviewerPhotoUrl: string | null
  /** FB recommendation, normalized: 'recommended' | 'not_recommended' | null. */
  recommendationType: 'recommended' | 'not_recommended' | null
  comment: string | null
  reviewCreatedAt: Date | null
  /** A permalink to the recommendation on Facebook, when available (read-only —
   *  the clinic replies on Facebook itself; Zernio has no FB reply endpoint). */
  permalink: string | null
}

export interface FacebookReviewStats {
  /** Total FB recommendations synced (recommended + not-recommended). */
  count: number
  /** How many recommend the clinic. */
  recommended: number
  /** How many do not. */
  notRecommended: number
}

function toView(r: schema.PlatformReviewRow): FacebookReviewView {
  return {
    id: r.id,
    externalReviewId: r.externalReviewId,
    reviewerName: r.reviewerName,
    reviewerPhotoUrl: r.reviewerPhotoUrl,
    recommendationType:
      r.recommendationType === 'recommended' || r.recommendationType === 'not_recommended'
        ? r.recommendationType
        : null,
    comment: r.comment,
    reviewCreatedAt: r.reviewCreatedAt,
    // The permalink is stashed in accountId? No — we don't have a permalink column.
    // We persist the permalink into `replyComment` would be wrong; instead the
    // permalink isn't persisted (Zernio gives a fresh one each pull). The view
    // exposes null here; the cron/list path can't reconstruct it offline. The UI
    // link-out points at the Page reviews tab generically when null.
    permalink: null,
  }
}

// ── Connection resolution ─────────────────────────────────────────────────────

/** Resolve the org's connected Facebook account: the Zernio accountId + whether
 *  the connection is the demo (no-network) one, or null when no FB Page is
 *  connected. */
async function resolveFacebookAccount(
  orgId: string,
): Promise<{ accountId: string; isDemo: boolean } | null> {
  const conn = await getZernioConnection(orgId)
  const account = conn.accounts.find((a) => a.platform === FACEBOOK)
  if (!account) return null
  return { accountId: account.id, isDemo: conn.isDemo }
}

/** Whether the org has a connected Facebook Page (demo or real). Used by the UI
 *  to choose between the FB reviews section and hiding it. */
export async function hasFacebookConnection(orgId: string): Promise<boolean> {
  return (await resolveFacebookAccount(orgId)) !== null
}

// ── Sync ──────────────────────────────────────────────────────────────────────

function parseDate(iso: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function newReviewRowId(): string {
  return `fr_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

/** Idempotent upsert of one pulled FB recommendation by (orgId, platform='facebook',
 *  externalReviewId). Updates mutable fields (comment edits, recommendation flips). */
async function upsertReview(
  orgId: string,
  accountId: string,
  r: FacebookReview,
  isDemo: number,
): Promise<void> {
  const now = new Date()
  await db
    .insert(schema.platformReview)
    .values({
      id: newReviewRowId(),
      organizationId: orgId,
      platform: FACEBOOK,
      externalReviewId: r.id,
      accountId,
      reviewerName: r.reviewerName,
      reviewerPhotoUrl: r.reviewerPhotoUrl,
      // FB recommendations have no star value (see module doc).
      starRating: r.starRating,
      recommendationType: r.recommendationType,
      comment: r.comment,
      reviewCreatedAt: parseDate(r.createTime),
      reviewUpdatedAt: parseDate(r.updateTime),
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
        recommendationType: r.recommendationType,
        comment: r.comment,
        reviewCreatedAt: parseDate(r.createTime),
        reviewUpdatedAt: parseDate(r.updateTime),
        updatedAt: now,
      },
    })
}

export interface SyncFacebookReviewsResult {
  ok: boolean
  /** Recommendations pulled + upserted this run. */
  synced: number
  /** Set when the org has no connected FB Page (not an error — caller decides). */
  skipped?: 'no_connection' | 'demo'
  error?: string
}

/**
 * Pull the org's Facebook recommendations via Zernio and idempotently upsert
 * them. Pages through `nextPageToken` (capped). DEMO connections never touch the
 * network — the seeded rows stand. On API failure (incl. the unconfirmed FB
 * review shape returning something unexpected) we record nothing destructive and
 * surface `ok:false` with the error (callers catch).
 */
export async function syncFacebookReviews(orgId: string): Promise<SyncFacebookReviewsResult> {
  const account = await resolveFacebookAccount(orgId)
  if (!account) return { ok: true, synced: 0, skipped: 'no_connection' }
  if (account.isDemo) return { ok: true, synced: 0, skipped: 'demo' }

  let synced = 0
  let pageToken: string | undefined
  try {
    for (let page = 0; page < MAX_SYNC_PAGES; page++) {
      const { reviews, nextPageToken } = await zernioListFacebookReviews({
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

/** Every synced Facebook recommendation for the org, newest first. */
export async function listFacebookReviews(orgId: string, limit = 100): Promise<FacebookReviewView[]> {
  const rows = await db
    .select()
    .from(schema.platformReview)
    .where(
      and(
        eq(schema.platformReview.organizationId, orgId),
        eq(schema.platformReview.platform, FACEBOOK),
      ),
    )
    .orderBy(
      desc(sql`COALESCE(${schema.platformReview.reviewCreatedAt}, ${schema.platformReview.createdAt})`),
    )
    .limit(limit)
  return rows.map(toView)
}

/** Recommend / don't-recommend tallies over the org's synced FB recommendations. */
export async function getFacebookReviewStats(orgId: string): Promise<FacebookReviewStats> {
  const rows = await db
    .select({ recommendationType: schema.platformReview.recommendationType })
    .from(schema.platformReview)
    .where(
      and(
        eq(schema.platformReview.organizationId, orgId),
        eq(schema.platformReview.platform, FACEBOOK),
      ),
    )

  let recommended = 0
  let notRecommended = 0
  for (const r of rows) {
    if (r.recommendationType === 'recommended') recommended++
    else if (r.recommendationType === 'not_recommended') notRecommended++
  }
  return { count: recommended + notRecommended, recommended, notRecommended }
}

// ── Cron helper ───────────────────────────────────────────────────────────────

/**
 * Sync Facebook recommendations for every org with a connected, NON-demo Zernio
 * connection. Driven by the same `/api/cron/sync-google-reviews` route (it now
 * sweeps both platforms). Each org is best-effort — one failure (incl. an org
 * with no FB Page) never aborts the batch. Orgs without a connected FB Page
 * short-circuit inside `syncFacebookReviews` (skipped:'no_connection').
 */
export async function syncAllFacebookReviews(): Promise<{
  scanned: number
  synced: number
  failed: number
  errors: Array<{ organizationId: string; error: string }>
}> {
  const conns = await db
    .select({ organizationId: schema.zernioConnection.organizationId })
    .from(schema.zernioConnection)
    .where(and(eq(schema.zernioConnection.status, 'connected'), eq(schema.zernioConnection.isDemo, 0)))

  const result = { scanned: 0, synced: 0, failed: 0, errors: [] as Array<{ organizationId: string; error: string }> }
  for (const conn of conns) {
    result.scanned++
    try {
      const r = await syncFacebookReviews(conn.organizationId)
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

/** Synthetic Facebook recommendations for the demo (Dream Dental). A few
 *  recommend, one doesn't (so the "From Facebook" section + the recommend/don't
 *  tallies showcase populated, honest state). One bare recommendation (no
 *  comment). Never networks. */
interface DemoFbReviewSeed {
  externalReviewId: string
  reviewerName: string
  recommendationType: 'recommended' | 'not_recommended'
  comment: string | null
  daysAgo: number
}

const DEMO_FACEBOOK_REVIEWS: DemoFbReviewSeed[] = [
  {
    externalReviewId: 'demo_fr_1',
    reviewerName: 'Jenna Ruiz',
    recommendationType: 'recommended',
    comment:
      'Recommends Dream Dental — "Took my whole family here and everyone was treated so well. The kids actually look forward to the dentist now. Couldn\'t recommend them more!"',
    daysAgo: 5,
  },
  {
    externalReviewId: 'demo_fr_2',
    reviewerName: 'Andre Coleman',
    recommendationType: 'recommended',
    comment:
      'Recommends Dream Dental — "Same-day emergency appointment when I cracked a tooth. Gentle, fast, and they explained the cost up front. This is my dentist now."',
    daysAgo: 12,
  },
  {
    // A bare recommendation (no written comment) — exercises the null-comment
    // render path.
    externalReviewId: 'demo_fr_3',
    reviewerName: 'Priscilla Tan',
    recommendationType: 'recommended',
    comment: null,
    daysAgo: 20,
  },
  {
    externalReviewId: 'demo_fr_4',
    reviewerName: 'Greg Mathis',
    recommendationType: 'not_recommended',
    comment:
      "Doesn't recommend Dream Dental — \"Wait was longer than I expected on my first visit. The care was good once I was seen, just wish the scheduling ran tighter.\"",
    daysAgo: 28,
  },
]

/**
 * Seed (or self-heal) the demo clinic's synthetic Facebook recommendations so
 * the Reviews "From Facebook" section + the recommend/don't tallies showcase
 * populated state. Idempotent (upsert by externalReviewId). Behind a
 * real-patient guard so an exhausted/empty context can't spawn orphan rows
 * (mirrors `seedDemoGoogleReviews`). NEVER networks.
 */
export async function seedDemoFacebookReviews(organizationId: string): Promise<void> {
  // Prerequisite guard — only seed for a real demo org (one with patients).
  const [anyPatient] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, organizationId))
    .limit(1)
  if (!anyPatient) return

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  for (const seed of DEMO_FACEBOOK_REVIEWS) {
    const createdAt = new Date(now - seed.daysAgo * dayMs)
    await db
      .insert(schema.platformReview)
      .values({
        id: `fr_demo_${seed.externalReviewId}`,
        organizationId,
        platform: FACEBOOK,
        externalReviewId: seed.externalReviewId,
        accountId: 'demo_fb_dream_dental',
        reviewerName: seed.reviewerName,
        reviewerPhotoUrl: null,
        starRating: null,
        recommendationType: seed.recommendationType,
        comment: seed.comment,
        reviewCreatedAt: createdAt,
        reviewUpdatedAt: createdAt,
        isDemo: 1,
      })
      .onConflictDoNothing()
  }
}
