import 'server-only'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { resolveGbpAccount, getZernioConnection } from '@/lib/services/zernio'
import {
  createGbpPost as zernioCreateGbpPost,
  deletePost as zernioDeletePost,
  GBP_POST_TYPES,
  GBP_CTA_TYPES,
  type CreateGbpPostInput,
  type GbpPostType,
  type GbpCtaType,
} from '@/lib/zernio'
import {
  GBP_POST_MAX_CHARS,
  ctaNeedsUrl,
  type GbpPostView,
  type GbpPostStatus,
  type CreateGbpPostFormInput,
} from '@/lib/types/zernio'

/**
 * Google Business posting service (Phase 2). Lets a clinic publish GBP posts
 * (Updates / Offers / Events) with a CTA button + an image through the Zernio
 * GBP connection, and keeps a durable post history.
 *
 * Discipline mirrors the other Zernio services (google-reviews / gbp-sync /
 * gbp-metrics):
 *   - BEST-EFFORT: `createGbpPost` NEVER throws to the UI. We persist the row
 *     FIRST (so the attempt is durable), then call Zernio; on failure we set
 *     `status='failed'` + `lastError` and return `{ ok:false, error }`.
 *   - DEMO-SAFE: a connection flagged `isDemo` NEVER hits the network — a demo
 *     create persists a 'published' row with a synthetic id + a fake googleUrl.
 *   - Idempotent reconcile is unnecessary (posts are append-only authored
 *     content, not synced records) — history is read straight from `gbp_post`.
 *
 * Honesty note (per the integration plan): Google DEPRECATED per-post insights,
 * so we record publish STATUS + a permalink, NOT fabricated per-post metrics.
 * Location-level performance lives on /seo (gbp-metrics.ts).
 */

const MAX_EVENT_TITLE = 120
const MAX_COUPON = 58
const MAX_TERMS = 5000

// ── Row → view ────────────────────────────────────────────────────────────────

function toView(r: schema.GbpPostRow): GbpPostView {
  return {
    id: r.id,
    postType: (GBP_POST_TYPES as readonly string[]).includes(r.postType)
      ? (r.postType as GbpPostType)
      : 'standard',
    summary: r.summary,
    imageUrl: r.imageUrl,
    ctaType: (GBP_CTA_TYPES as readonly string[]).includes(r.ctaType ?? '')
      ? (r.ctaType as GbpCtaType)
      : null,
    ctaUrl: r.ctaUrl,
    eventTitle: r.eventTitle,
    eventStartAtIso: r.eventStartAt ? r.eventStartAt.toISOString() : null,
    eventEndAtIso: r.eventEndAt ? r.eventEndAt.toISOString() : null,
    offerCouponCode: r.offerCouponCode,
    offerRedeemUrl: r.offerRedeemUrl,
    offerTerms: r.offerTerms,
    status: r.status as GbpPostStatus,
    scheduledAtIso: r.scheduledAt ? r.scheduledAt.toISOString() : null,
    publishedAtIso: r.publishedAt ? r.publishedAt.toISOString() : null,
    googleUrl: r.googleUrl,
    lastError: r.lastError,
    createdAtIso: r.createdAt.toISOString(),
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

/** A validated, normalized create input — what we persist + send to Zernio.
 *  `scheduledAt` is a Date when scheduling (future), else null (publish now). */
interface NormalizedCreate {
  postType: GbpPostType
  summary: string
  imageUrl: string | null
  ctaType: GbpCtaType | null
  ctaUrl: string | null
  eventTitle: string | null
  eventStartAt: Date | null
  eventEndAt: Date | null
  offerCouponCode: string | null
  offerRedeemUrl: string | null
  offerTerms: string | null
  scheduledAt: Date | null
}

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function parseFutureDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Validate + normalize the composer payload. Returns `{ ok, value }` or
 * `{ ok:false, error }` with a clinic-facing message. Pure (no DB/network) so
 * it's unit-testable in isolation. Exported for tests.
 */
export function validateGbpPostInput(
  input: CreateGbpPostFormInput,
): { ok: true; value: NormalizedCreate } | { ok: false; error: string } {
  const postType = (GBP_POST_TYPES as readonly string[]).includes(input.postType)
    ? (input.postType as GbpPostType)
    : null
  if (!postType) return { ok: false, error: 'Pick a post type.' }

  const summary = (input.summary ?? '').trim()
  if (!summary) return { ok: false, error: 'Write something to post.' }
  if (summary.length > GBP_POST_MAX_CHARS) {
    return { ok: false, error: `Posts are limited to ${GBP_POST_MAX_CHARS} characters.` }
  }

  // Image (optional). Must be a public http(s) URL Google can fetch.
  const imageUrl = input.imageUrl?.trim() || null
  if (imageUrl && !isHttpUrl(imageUrl)) {
    return { ok: false, error: 'The image must be a public URL.' }
  }

  // CTA (optional). When present, CALL needs no URL; everything else does.
  let ctaType: GbpCtaType | null = null
  let ctaUrl: string | null = null
  if (input.ctaType) {
    if (!(GBP_CTA_TYPES as readonly string[]).includes(input.ctaType)) {
      return { ok: false, error: 'Pick a valid call-to-action.' }
    }
    ctaType = input.ctaType as GbpCtaType
    if (ctaNeedsUrl(ctaType)) {
      ctaUrl = input.ctaUrl?.trim() || null
      if (!ctaUrl) return { ok: false, error: 'Add a link for the call-to-action button.' }
      if (!isHttpUrl(ctaUrl)) return { ok: false, error: 'The call-to-action link must be a valid URL.' }
    }
  }

  // EVENT fields.
  let eventTitle: string | null = null
  let eventStartAt: Date | null = null
  let eventEndAt: Date | null = null
  if (postType === 'event') {
    eventTitle = (input.eventTitle ?? '').trim() || null
    if (!eventTitle) return { ok: false, error: 'Give your event a title.' }
    if (eventTitle.length > MAX_EVENT_TITLE) {
      return { ok: false, error: `Event titles are limited to ${MAX_EVENT_TITLE} characters.` }
    }
    eventStartAt = parseFutureDate(input.eventStartAt)
    if (!eventStartAt) return { ok: false, error: 'Pick a start date for your event.' }
    eventEndAt = parseFutureDate(input.eventEndAt)
    if (eventEndAt && eventEndAt.getTime() < eventStartAt.getTime()) {
      return { ok: false, error: 'The event end can’t be before it starts.' }
    }
  }

  // OFFER fields (all optional per Google).
  let offerCouponCode: string | null = null
  let offerRedeemUrl: string | null = null
  let offerTerms: string | null = null
  if (postType === 'offer') {
    offerCouponCode = (input.offerCouponCode ?? '').trim() || null
    if (offerCouponCode && offerCouponCode.length > MAX_COUPON) {
      return { ok: false, error: `Coupon codes are limited to ${MAX_COUPON} characters.` }
    }
    offerRedeemUrl = input.offerRedeemUrl?.trim() || null
    if (offerRedeemUrl && !isHttpUrl(offerRedeemUrl)) {
      return { ok: false, error: 'The redeem link must be a valid URL.' }
    }
    offerTerms = (input.offerTerms ?? '').trim() || null
    if (offerTerms && offerTerms.length > MAX_TERMS) {
      return { ok: false, error: 'The offer terms are too long.' }
    }
  }

  // Scheduling (optional). Must be in the future when set.
  let scheduledAt: Date | null = null
  if (input.scheduledAt) {
    scheduledAt = parseFutureDate(input.scheduledAt)
    if (!scheduledAt) return { ok: false, error: 'Pick a valid date to schedule the post.' }
    if (scheduledAt.getTime() <= Date.now()) {
      return { ok: false, error: 'Schedule the post for a time in the future.' }
    }
  }

  return {
    ok: true,
    value: {
      postType,
      summary,
      imageUrl,
      ctaType,
      ctaUrl,
      eventTitle,
      eventStartAt,
      eventEndAt,
      offerCouponCode,
      offerRedeemUrl,
      offerTerms,
      scheduledAt,
    },
  }
}

// ── Create ──────────────────────────────────────────────────────────────────

export interface CreateGbpPostResult {
  ok: boolean
  /** The persisted post id (present even on a failed publish). */
  postId?: string
  /** The post's status after the attempt. */
  status?: GbpPostStatus
  /** Set when the org has no connected GBP (not an error — caller decides). */
  skipped?: 'no_connection'
  error?: string
}

function newPostId(): string {
  return `gbp_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

/**
 * Create (publish-now or schedule) a Google Business post for the org. Validates
 * the input, resolves the GBP account, persists a row, then calls Zernio.
 *
 * Best-effort: NEVER throws. On a Zernio failure we record `status='failed'` +
 * `lastError` and return `{ ok:false, error }` so the composer can surface it.
 * Demo connections persist a 'published' row with a synthetic id (never network).
 */
export async function createGbpPost(
  orgId: string,
  input: CreateGbpPostFormInput,
): Promise<CreateGbpPostResult> {
  const parsed = validateGbpPostInput(input)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const v = parsed.value

  const account = await resolveGbpAccount(orgId)
  if (!account) return { ok: false, skipped: 'no_connection', error: 'Connect your Google Business Profile to post.' }

  const now = new Date()
  const id = newPostId()
  const initialStatus: GbpPostStatus = v.scheduledAt ? 'scheduled' : 'published'

  // DEMO: persist a published row with a synthetic id + fake permalink. NEVER
  // networks (per the no-fake-content rule the page must populate every field).
  if (account.isDemo) {
    await insertRow(orgId, id, account.accountId, v, {
      zernioPostId: `demo_zpost_${id}`,
      status: initialStatus,
      publishedAt: v.scheduledAt ? null : now,
      googleUrl: 'https://www.google.com/maps?cid=demo-dream-dental',
      lastError: null,
      isDemo: 1,
    })
    return { ok: true, postId: id, status: initialStatus }
  }

  // REAL: persist FIRST (durable record of the attempt), then publish.
  await insertRow(orgId, id, account.accountId, v, {
    zernioPostId: null,
    status: 'draft',
    publishedAt: null,
    googleUrl: null,
    lastError: null,
    isDemo: 0,
  })

  // Resolve the profile id (the create call needs both profile + account).
  const conn = await getZernioConnection(orgId)
  const profileId = conn.zernioProfileId
  if (!profileId) {
    await db
      .update(schema.gbpPost)
      .set({ status: 'failed', lastError: 'No Google Business profile is linked.', updatedAt: new Date() })
      .where(eq(schema.gbpPost.id, id))
    return { ok: false, postId: id, status: 'failed', error: 'No Google Business profile is linked.' }
  }

  const apiInput: CreateGbpPostInput = {
    profileId,
    accountId: account.accountId,
    summary: v.summary,
    postType: v.postType,
    imageUrl: v.imageUrl,
    cta: v.ctaType ? { actionType: v.ctaType, url: v.ctaUrl } : null,
    event:
      v.postType === 'event' && v.eventStartAt
        ? {
            title: v.eventTitle ?? '',
            startAt: v.eventStartAt.toISOString(),
            endAt: v.eventEndAt ? v.eventEndAt.toISOString() : null,
          }
        : null,
    offer:
      v.postType === 'offer'
        ? { couponCode: v.offerCouponCode, redeemUrl: v.offerRedeemUrl, terms: v.offerTerms }
        : null,
    scheduledAt: v.scheduledAt ? v.scheduledAt.toISOString() : null,
  }

  try {
    const result = await zernioCreateGbpPost(apiInput)
    const status: GbpPostStatus = v.scheduledAt ? 'scheduled' : 'published'
    await db
      .update(schema.gbpPost)
      .set({
        zernioPostId: result.zernioPostId,
        status,
        publishedAt: v.scheduledAt ? null : new Date(),
        googleUrl: result.googleUrl,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.gbpPost.id, id))
    return { ok: true, postId: id, status }
  } catch (e) {
    const error = (e as Error).message
    await db
      .update(schema.gbpPost)
      .set({ status: 'failed', lastError: error, updatedAt: new Date() })
      .where(eq(schema.gbpPost.id, id))
    return { ok: false, postId: id, status: 'failed', error }
  }
}

/** Insert a gbp_post row with the validated fields + outcome columns. */
async function insertRow(
  orgId: string,
  id: string,
  accountId: string,
  v: NormalizedCreate,
  outcome: {
    zernioPostId: string | null
    status: GbpPostStatus
    publishedAt: Date | null
    googleUrl: string | null
    lastError: string | null
    isDemo: number
  },
): Promise<void> {
  await db.insert(schema.gbpPost).values({
    id,
    organizationId: orgId,
    accountId,
    zernioPostId: outcome.zernioPostId,
    postType: v.postType,
    summary: v.summary,
    imageUrl: v.imageUrl,
    ctaType: v.ctaType,
    ctaUrl: v.ctaUrl,
    eventTitle: v.eventTitle,
    eventStartAt: v.eventStartAt,
    eventEndAt: v.eventEndAt,
    offerCouponCode: v.offerCouponCode,
    offerRedeemUrl: v.offerRedeemUrl,
    offerTerms: v.offerTerms,
    status: outcome.status,
    scheduledAt: v.scheduledAt,
    publishedAt: outcome.publishedAt,
    googleUrl: outcome.googleUrl,
    lastError: outcome.lastError,
    isDemo: outcome.isDemo,
  })
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Whether the org has a connected GBP (demo or real) — drives the composer
 *  vs connect-prompt empty state. */
export async function hasGbpConnection(orgId: string): Promise<boolean> {
  return (await resolveGbpAccount(orgId)) !== null
}

/** The org's GBP post history, newest first. */
export async function listGbpPosts(orgId: string, limit = 50): Promise<GbpPostView[]> {
  const rows = await db
    .select()
    .from(schema.gbpPost)
    .where(eq(schema.gbpPost.organizationId, orgId))
    .orderBy(desc(schema.gbpPost.createdAt))
    .limit(limit)
  return rows.map(toView)
}

// ── Delete ──────────────────────────────────────────────────────────────────

/**
 * Delete a GBP post. Best-effort at Zernio when a post id exists (a Zernio
 * failure never blocks the local delete — the clinic's intent is honored), then
 * always drops the local row. Demo posts are local-only (never network).
 */
export async function deleteGbpPost(
  orgId: string,
  postId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select()
    .from(schema.gbpPost)
    .where(and(eq(schema.gbpPost.organizationId, orgId), eq(schema.gbpPost.id, postId)))
    .limit(1)
  if (!row) return { ok: false, error: 'That post is no longer available.' }

  if (row.isDemo !== 1 && row.zernioPostId) {
    try {
      await zernioDeletePost(row.zernioPostId)
    } catch {
      // Best-effort — still drop the local row below.
    }
  }

  await db
    .delete(schema.gbpPost)
    .where(and(eq(schema.gbpPost.organizationId, orgId), eq(schema.gbpPost.id, postId)))
  return { ok: true }
}

// ── Demo seeding ──────────────────────────────────────────────────────────────

interface DemoPostSeed {
  externalId: string
  postType: GbpPostType
  summary: string
  imageUrl: string | null
  ctaType: GbpCtaType | null
  ctaUrl: string | null
  eventTitle: string | null
  eventStartDaysFromNow: number | null
  eventEndDaysFromNow: number | null
  offerCouponCode: string | null
  offerRedeemUrl: string | null
  offerTerms: string | null
  status: GbpPostStatus
  /** days ago published (published rows) — null for scheduled. */
  publishedDaysAgo: number | null
  /** days from now scheduled (scheduled rows) — null for published. */
  scheduledDaysFromNow: number | null
  /** days ago created (for ordering). */
  createdDaysAgo: number
}

/** A stock dental photo on the public-read S3 bucket (same pattern the demo
 *  hero/office photos use) so the history thumbnail renders without networking. */
const DEMO_POST_IMAGE =
  'https://dreamcrm-uploads-prod.s3.amazonaws.com/demo/gbp-post-whitening.jpg'

const DEMO_GBP_POSTS: DemoPostSeed[] = [
  {
    externalId: 'demo_post_1',
    postType: 'standard',
    summary:
      "New patients welcome! 🦷 We're booking same-week cleanings this month — gentle, judgment-free care from a team that actually listens. Tap below to grab a time online in under a minute.",
    imageUrl: DEMO_POST_IMAGE,
    ctaType: 'BOOK',
    // Filled in at seed time with the clinic's real /book URL (see seeder).
    ctaUrl: null,
    eventTitle: null,
    eventStartDaysFromNow: null,
    eventEndDaysFromNow: null,
    offerCouponCode: null,
    offerRedeemUrl: null,
    offerTerms: null,
    status: 'published',
    publishedDaysAgo: 4,
    scheduledDaysFromNow: null,
    createdDaysAgo: 4,
  },
  {
    externalId: 'demo_post_2',
    postType: 'offer',
    summary:
      'Brighten your smile for the holidays ✨ $99 professional whitening for new patients through the end of the month. Mention code SMILE99 when you book.',
    imageUrl: null,
    ctaType: 'LEARN_MORE',
    ctaUrl: null,
    eventTitle: null,
    eventStartDaysFromNow: null,
    eventEndDaysFromNow: null,
    offerCouponCode: 'SMILE99',
    offerRedeemUrl: null,
    offerTerms: 'New patients only. One per household. Cannot be combined with insurance or other offers.',
    status: 'published',
    publishedDaysAgo: 11,
    scheduledDaysFromNow: null,
    createdDaysAgo: 11,
  },
  {
    externalId: 'demo_post_3',
    postType: 'event',
    summary:
      "Free Kids' Smile Day! 🪥 Bring the little ones for a no-cost check-up, balloons, and a goodie bag. No appointment needed — just drop by. Limited spots, so come early!",
    imageUrl: null,
    ctaType: 'LEARN_MORE',
    ctaUrl: null,
    eventTitle: "Kids' Smile Day",
    eventStartDaysFromNow: 12,
    eventEndDaysFromNow: 12,
    offerCouponCode: null,
    offerRedeemUrl: null,
    offerTerms: null,
    status: 'scheduled',
    publishedDaysAgo: null,
    scheduledDaysFromNow: 5,
    createdDaysAgo: 1,
  },
]

/**
 * Seed (or self-heal) the demo clinic's GBP posts so the Google Posts page
 * showcases the composer output + a populated history (a published Update with
 * an image + Book CTA, a published Offer with a coupon, a scheduled Event).
 * Idempotent (insert-by synthetic id, skip when present). Scoped to the isDemo
 * org by the caller; behind a real-patient guard (mirrors seedDemoZernio).
 * NEVER networks. The Book CTA URL is the clinic's real /book link.
 */
export async function seedDemoGbpPosts(organizationId: string): Promise<void> {
  // Prerequisite guard — only seed for a real demo org (one with patients).
  const [anyPatient] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, organizationId))
    .limit(1)
  if (!anyPatient) return

  // A connected (demo) GBP must exist — the page reads the connection. The
  // account id matches seedDemoZernio's synthetic id.
  const account = await resolveGbpAccount(organizationId)
  if (!account) return
  const accountId = account.accountId

  // Resolve the clinic's real /book URL for the Book CTA (honest demo).
  const bookUrl = await resolveDemoBookUrl(organizationId)

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  for (const seed of DEMO_GBP_POSTS) {
    const createdAt = new Date(now - seed.createdDaysAgo * dayMs)
    const publishedAt = seed.publishedDaysAgo != null ? new Date(now - seed.publishedDaysAgo * dayMs) : null
    const scheduledAt = seed.scheduledDaysFromNow != null ? new Date(now + seed.scheduledDaysFromNow * dayMs) : null
    const eventStartAt =
      seed.eventStartDaysFromNow != null ? new Date(now + seed.eventStartDaysFromNow * dayMs) : null
    const eventEndAt = seed.eventEndDaysFromNow != null ? new Date(now + seed.eventEndDaysFromNow * dayMs) : null
    const ctaUrl = seed.ctaType === 'BOOK' ? bookUrl : seed.ctaUrl

    await db
      .insert(schema.gbpPost)
      .values({
        id: `gbp_demo_${seed.externalId}`,
        organizationId,
        accountId,
        zernioPostId: `demo_zpost_${seed.externalId}`,
        postType: seed.postType,
        summary: seed.summary,
        imageUrl: seed.imageUrl,
        ctaType: seed.ctaType,
        ctaUrl,
        eventTitle: seed.eventTitle,
        eventStartAt,
        eventEndAt,
        offerCouponCode: seed.offerCouponCode,
        offerRedeemUrl: seed.offerRedeemUrl,
        offerTerms: seed.offerTerms,
        status: seed.status,
        scheduledAt,
        // Published rows carry a fake permalink; scheduled rows don't yet.
        publishedAt,
        googleUrl: seed.status === 'published' ? 'https://www.google.com/maps?cid=demo-dream-dental' : null,
        lastError: null,
        isDemo: 1,
        createdAt,
        updatedAt: createdAt,
      })
      .onConflictDoNothing()
  }
}

/** The demo clinic's /book URL for the seeded Book CTA. Falls back to the
 *  path-based public URL if the slug lookup misses. */
async function resolveDemoBookUrl(orgId: string): Promise<string> {
  const [org] = await db
    .select({ slug: schema.organization.slug })
    .from(schema.organization)
    .where(eq(schema.organization.id, orgId))
    .limit(1)
  const siteDomain = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'
  const slug = org?.slug ?? 'acme-dental-demo'
  const base =
    process.env.NEXT_PUBLIC_SITE_USE_SUBDOMAIN === 'true'
      ? `https://${slug}.${siteDomain}`
      : `https://${siteDomain}/site/${slug}`
  return `${base}/book`
}
