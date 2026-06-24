import 'server-only'
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getZernioConnection } from '@/lib/services/zernio'
import { normalizeMetricsWindow } from '@/lib/services/metrics-window'
import {
  createGbpPost as zernioCreateGbpPost,
  createSocialPost as zernioCreateSocialPost,
  deletePost as zernioDeletePost,
  GBP_POST_TYPES,
  GBP_CTA_TYPES,
  type GbpPostType,
  type GbpCtaType,
  type GbpPostResult,
} from '@/lib/zernio'
import {
  GBP_POST_MAX_CHARS,
  SOCIAL_POST_MAX_CHARS,
  postCharLimitForTargets,
  ctaNeedsUrl,
  platformLabel,
  platformIcon,
  GOOGLE_BUSINESS_PLATFORM,
  type GbpPostStatus,
  type SocialPostView,
  type SocialPostTargetView,
  type ComposerChannel,
  type CreateSocialPostFormInput,
} from '@/lib/types/zernio'

/**
 * Unified multi-platform post service (Phase 3 PR 3). Generalizes the Phase-2
 * GBP posting service: ONE composed post (text + optional image + optional
 * schedule) fans out to one or MORE connected channels (Google Business + the
 * shortlisted socials). A GBP-only post is just a 1-target post.
 *
 * Discipline carried over from Phase 2 (and the other Zernio services):
 *   - BEST-EFFORT: `createSocialPost` NEVER throws to the UI. We persist the
 *     parent + per-target rows FIRST (so the attempt is durable), then call
 *     Zernio PER TARGET; one channel failing sets only THAT target's
 *     status='failed' + lastError — the others still publish. The parent status
 *     is a rollup. Returns `{ ok, postId, status }`.
 *   - DEMO-SAFE: a connection flagged `isDemo` NEVER hits the network — a demo
 *     create persists 'published'/'scheduled' targets with synthetic ids + a
 *     fake permalink.
 *   - History reads straight from `social_post` + `social_post_target`.
 *
 * Honesty note (per the integration plan): per-post insights are deprecated on
 * Google and not yet pulled for the socials, so we record publish STATUS + a
 * permalink, NOT fabricated per-post metrics. Per-platform analytics arrive in
 * PR 4; location-level GBP performance is on /seo.
 *
 * The GBP-specific fields (postType / CTA / event / offer) only apply when a
 * Google Business account is among the targets — they're ignored for a
 * social-only post (and skipped in validation).
 */

const MAX_EVENT_TITLE = 120
const MAX_COUPON = 58
const MAX_TERMS = 5000

// ── Validation ──────────────────────────────────────────────────────────────

/** A validated, normalized create input — what we persist + send to Zernio. */
interface NormalizedCreate {
  accountIds: string[]
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
 * Validate + normalize the composer payload. `targetPlatforms` is the resolved
 * platform of each targeted account (so we know whether GBP is in the mix). The
 * GBP-only fields (post type extras, CTA, event, offer) are only validated when
 * Google Business is a target. Returns `{ ok, value }` or `{ ok:false, error }`.
 * Pure (no DB/network), exported for tests.
 */
export function validateSocialPostInput(
  input: CreateSocialPostFormInput,
  targetPlatforms: readonly string[],
): { ok: true; value: NormalizedCreate } | { ok: false; error: string } {
  const accountIds = (input.accountIds ?? []).filter((id) => typeof id === 'string' && id.trim())
  if (accountIds.length === 0) return { ok: false, error: 'Pick at least one channel to post to.' }

  const targetsGbp = targetPlatforms.includes(GOOGLE_BUSINESS_PLATFORM)

  // Post type only matters for GBP. For a social-only post, force 'standard'.
  let postType: GbpPostType = 'standard'
  if (targetsGbp) {
    const pt = (GBP_POST_TYPES as readonly string[]).includes(input.postType)
      ? (input.postType as GbpPostType)
      : null
    if (!pt) return { ok: false, error: 'Pick a post type.' }
    postType = pt
  }

  const summary = (input.summary ?? '').trim()
  if (!summary) return { ok: false, error: 'Write something to post.' }
  const cap = postCharLimitForTargets(targetPlatforms)
  if (summary.length > cap) {
    return { ok: false, error: `That's too long for the channels you picked (max ${cap} characters).` }
  }

  // Image (optional). Must be a public http(s) URL the platforms can fetch.
  const imageUrl = input.imageUrl?.trim() || null
  if (imageUrl && !isHttpUrl(imageUrl)) {
    return { ok: false, error: 'The image must be a public URL.' }
  }

  // CTA (GBP only). When present, CALL needs no URL; everything else does.
  let ctaType: GbpCtaType | null = null
  let ctaUrl: string | null = null
  if (targetsGbp && input.ctaType) {
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

  // EVENT fields (GBP only).
  let eventTitle: string | null = null
  let eventStartAt: Date | null = null
  let eventEndAt: Date | null = null
  if (targetsGbp && postType === 'event') {
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

  // OFFER fields (GBP only; all optional per Google).
  let offerCouponCode: string | null = null
  let offerRedeemUrl: string | null = null
  let offerTerms: string | null = null
  if (targetsGbp && postType === 'offer') {
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
      accountIds,
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

// ── Channels (for the composer picker) ────────────────────────────────────────

/**
 * The org's connected channels, shaped for the composer picker. GBP first, then
 * the connected socials. Reads `getZernioConnection().accounts` (multi-platform
 * since PR 2). Returns [] when nothing is connected → the page shows a
 * connect-prompt to /integrations.
 */
export async function getComposerChannels(orgId: string): Promise<ComposerChannel[]> {
  const conn = await getZernioConnection(orgId)
  // Only surface a connected GBP when the connection status is 'connected'
  // (mirrors resolveGbpAccount) — a stale GBP account row on an errored
  // connection shouldn't be postable.
  const accounts = conn.accounts.filter((a) => {
    if (a.platform === GOOGLE_BUSINESS_PLATFORM) return conn.status === 'connected'
    return true
  })
  // GBP first, then socials in account order.
  accounts.sort((a, b) => {
    const ag = a.platform === GOOGLE_BUSINESS_PLATFORM ? 0 : 1
    const bg = b.platform === GOOGLE_BUSINESS_PLATFORM ? 0 : 1
    return ag - bg
  })
  return accounts.map((a) => ({
    accountId: a.id,
    platform: a.platform,
    label: platformLabel(a.platform),
    icon: platformIcon(a.platform),
    handle: a.username || a.displayName,
  }))
}

/** Whether the org has any connected channel (GBP or social) — drives the
 *  composer vs connect-prompt empty state. */
export async function hasAnyChannelConnected(orgId: string): Promise<boolean> {
  return (await getComposerChannels(orgId)).length > 0
}

/**
 * Published posts per platform in the window — the activity behind the social
 * reach numbers on Analytics. Honest: a count of what you put out, NOT
 * per-post reach (Zernio + Google deprecated per-post insights, so we never
 * fabricate that). Keyed by platform slug. A plain local read — demo-safe,
 * since demos seed real `social_post_target` rows.
 */
export async function getPublishedPostCounts(
  orgId: string,
  opts: { days?: number } = {},
): Promise<Record<string, number>> {
  const windowDays = normalizeMetricsWindow(opts.days)
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
  const rows = await db
    .select({ platform: schema.socialPostTarget.platform, c: count() })
    .from(schema.socialPostTarget)
    .where(
      and(
        eq(schema.socialPostTarget.organizationId, orgId),
        eq(schema.socialPostTarget.status, 'published'),
        gte(schema.socialPostTarget.publishedAt, since),
      ),
    )
    .groupBy(schema.socialPostTarget.platform)
  const out: Record<string, number> = {}
  for (const r of rows) out[r.platform] = Number(r.c)
  return out
}

// ── Create ──────────────────────────────────────────────────────────────────

export interface CreateSocialPostResult {
  ok: boolean
  /** The persisted parent post id (present even on a fully-failed publish). */
  postId?: string
  /** The parent's rollup status after the attempt. */
  status?: GbpPostStatus
  /** Set when the org has no matching connected channels (not an error). */
  skipped?: 'no_connection'
  error?: string
}

function newPostId(): string {
  return `spost_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}

/** Roll the per-target statuses up into a single parent status. */
function rollupStatus(targets: GbpPostStatus[]): GbpPostStatus {
  if (targets.length === 0) return 'draft'
  if (targets.some((s) => s === 'failed')) return 'failed'
  if (targets.every((s) => s === 'scheduled')) return 'scheduled'
  if (targets.some((s) => s === 'published')) return 'published'
  if (targets.some((s) => s === 'scheduled')) return 'scheduled'
  return 'draft'
}

/**
 * Create (publish-now or schedule) a multi-channel social post. Validates the
 * input, resolves each target account, persists the parent + per-target rows,
 * then calls Zernio per target (GBP → the GBP wrapper w/ options; social → the
 * generic wrapper). Records each target's outcome independently + rolls the
 * parent status up.
 *
 * Best-effort: NEVER throws. Demo connections persist published/scheduled rows
 * with synthetic ids (never network).
 */
export async function createSocialPost(
  orgId: string,
  input: CreateSocialPostFormInput,
): Promise<CreateSocialPostResult> {
  // Resolve the connection + the targeted accounts.
  const conn = await getZernioConnection(orgId)
  const requested = (input.accountIds ?? []).filter((id) => typeof id === 'string' && id.trim())
  if (requested.length === 0) return { ok: false, error: 'Pick at least one channel to post to.' }

  // Map requested account ids → connected accounts (GBP must be on a connected
  // connection to be valid; socials are valid whenever the account row exists).
  const byId = new Map(conn.accounts.map((a) => [a.id, a]))
  const targets = requested
    .map((id) => byId.get(id))
    .filter((a): a is NonNullable<typeof a> => {
      if (!a) return false
      if (a.platform === GOOGLE_BUSINESS_PLATFORM) return conn.status === 'connected'
      return true
    })
  if (targets.length === 0) {
    return { ok: false, skipped: 'no_connection', error: 'Connect a channel before posting.' }
  }

  const targetPlatforms = targets.map((t) => t.platform)
  const parsed = validateSocialPostInput({ ...input, accountIds: requested }, targetPlatforms)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const v = parsed.value

  const now = new Date()
  const postId = newPostId()
  const isDemo = conn.isDemo
  const initialTargetStatus: GbpPostStatus = v.scheduledAt ? 'scheduled' : isDemo ? 'published' : 'draft'

  // Persist the PARENT first.
  await db.insert(schema.socialPost).values({
    id: postId,
    organizationId: orgId,
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
    status: v.scheduledAt ? 'scheduled' : isDemo ? 'published' : 'draft',
    scheduledAt: v.scheduledAt,
    publishedAt: isDemo && !v.scheduledAt ? now : null,
    isDemo: isDemo ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  })

  // Persist a target row per channel (up-front, durable).
  const targetRows = targets.map((t) => ({
    id: `${postId}_t_${t.id}`,
    socialPostId: postId,
    organizationId: orgId,
    platform: t.platform,
    accountId: t.id,
  }))
  for (const t of targets) {
    const id = `${postId}_t_${t.id}`
    await db.insert(schema.socialPostTarget).values({
      id,
      socialPostId: postId,
      organizationId: orgId,
      platform: t.platform,
      accountId: t.id,
      zernioPostId: isDemo ? `demo_zpost_${id}` : null,
      status: initialTargetStatus,
      googleUrl: isDemo && !v.scheduledAt ? demoPermalink(t.platform) : null,
      lastError: null,
      publishedAt: isDemo && !v.scheduledAt ? now : null,
    })
  }

  // DEMO: rows are already in their final published/scheduled state. No network.
  if (isDemo) {
    return { ok: true, postId, status: v.scheduledAt ? 'scheduled' : 'published' }
  }

  // REAL: need a Zernio profile to publish.
  const profileId = conn.zernioProfileId
  if (!profileId) {
    const msg = 'No Zernio profile is linked.'
    for (const tr of targetRows) {
      await db
        .update(schema.socialPostTarget)
        .set({ status: 'failed', lastError: msg, updatedAt: new Date() })
        .where(eq(schema.socialPostTarget.id, tr.id))
    }
    await db
      .update(schema.socialPost)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(schema.socialPost.id, postId))
    return { ok: false, postId, status: 'failed', error: msg }
  }

  // Publish each target independently (one Zernio call per channel).
  const finalStatuses: GbpPostStatus[] = []
  for (const t of targets) {
    const targetRowId = `${postId}_t_${t.id}`
    try {
      let result: GbpPostResult
      if (t.platform === GOOGLE_BUSINESS_PLATFORM) {
        result = await zernioCreateGbpPost({
          profileId,
          accountId: t.id,
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
        })
      } else {
        result = await zernioCreateSocialPost({
          profileId,
          accountId: t.id,
          platform: t.platform,
          summary: v.summary,
          imageUrl: v.imageUrl,
          scheduledAt: v.scheduledAt ? v.scheduledAt.toISOString() : null,
        })
      }
      const status: GbpPostStatus = v.scheduledAt ? 'scheduled' : 'published'
      finalStatuses.push(status)
      await db
        .update(schema.socialPostTarget)
        .set({
          zernioPostId: result.zernioPostId,
          status,
          googleUrl: result.googleUrl,
          publishedAt: v.scheduledAt ? null : new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.socialPostTarget.id, targetRowId))
    } catch (e) {
      finalStatuses.push('failed')
      await db
        .update(schema.socialPostTarget)
        .set({ status: 'failed', lastError: (e as Error).message, updatedAt: new Date() })
        .where(eq(schema.socialPostTarget.id, targetRowId))
    }
  }

  const rollup = rollupStatus(finalStatuses)
  const anyPublished = finalStatuses.includes('published')
  await db
    .update(schema.socialPost)
    .set({
      status: rollup,
      publishedAt: anyPublished && !v.scheduledAt ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.socialPost.id, postId))

  // ok when at least one channel succeeded (published or scheduled).
  const ok = finalStatuses.some((s) => s !== 'failed')
  const firstError = ok ? undefined : 'Could not publish the post.'
  return { ok, postId, status: rollup, error: firstError }
}

/** A synthetic permalink for a demo target (platform-specific flavor). */
function demoPermalink(platform: string): string {
  if (platform === GOOGLE_BUSINESS_PLATFORM) return 'https://www.google.com/maps?cid=demo-dream-dental'
  return `https://${platform}.com/dreamdental`
}

// ── Read ──────────────────────────────────────────────────────────────────────

function toTargetView(r: schema.SocialPostTargetRow): SocialPostTargetView {
  return {
    id: r.id,
    platform: r.platform,
    label: platformLabel(r.platform),
    icon: platformIcon(r.platform),
    status: r.status as GbpPostStatus,
    url: r.googleUrl,
    lastError: r.lastError,
    publishedAtIso: r.publishedAt ? r.publishedAt.toISOString() : null,
  }
}

function toView(post: schema.SocialPostRow, targets: schema.SocialPostTargetRow[]): SocialPostView {
  return {
    id: post.id,
    postType: (GBP_POST_TYPES as readonly string[]).includes(post.postType)
      ? (post.postType as GbpPostType)
      : 'standard',
    summary: post.summary,
    imageUrl: post.imageUrl,
    ctaType: (GBP_CTA_TYPES as readonly string[]).includes(post.ctaType ?? '')
      ? (post.ctaType as GbpCtaType)
      : null,
    ctaUrl: post.ctaUrl,
    eventTitle: post.eventTitle,
    eventStartAtIso: post.eventStartAt ? post.eventStartAt.toISOString() : null,
    eventEndAtIso: post.eventEndAt ? post.eventEndAt.toISOString() : null,
    offerCouponCode: post.offerCouponCode,
    offerRedeemUrl: post.offerRedeemUrl,
    offerTerms: post.offerTerms,
    status: post.status as GbpPostStatus,
    scheduledAtIso: post.scheduledAt ? post.scheduledAt.toISOString() : null,
    publishedAtIso: post.publishedAt ? post.publishedAt.toISOString() : null,
    createdAtIso: post.createdAt.toISOString(),
    targets: targets
      .filter((t) => t.socialPostId === post.id)
      .map(toTargetView),
  }
}

/** The org's social-post history (parent + targets), newest first. */
export async function listSocialPosts(orgId: string, limit = 100): Promise<SocialPostView[]> {
  const posts = await db
    .select()
    .from(schema.socialPost)
    .where(eq(schema.socialPost.organizationId, orgId))
    .orderBy(desc(schema.socialPost.createdAt))
    .limit(limit)
  if (posts.length === 0) return []
  const ids = posts.map((p) => p.id)
  const targets = await db
    .select()
    .from(schema.socialPostTarget)
    .where(inArray(schema.socialPostTarget.socialPostId, ids))
  return posts.map((p) => toView(p, targets))
}

// ── Delete ──────────────────────────────────────────────────────────────────

/**
 * Delete a social post. Best-effort at Zernio for each target that has a post id
 * (a Zernio failure never blocks the local delete), then always drop the local
 * rows (targets cascade off the parent). Demo posts are local-only.
 */
export async function deleteSocialPost(
  orgId: string,
  postId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [post] = await db
    .select()
    .from(schema.socialPost)
    .where(and(eq(schema.socialPost.organizationId, orgId), eq(schema.socialPost.id, postId)))
    .limit(1)
  if (!post) return { ok: false, error: 'That post is no longer available.' }

  if (post.isDemo !== 1) {
    const targets = await db
      .select()
      .from(schema.socialPostTarget)
      .where(eq(schema.socialPostTarget.socialPostId, postId))
    for (const t of targets) {
      if (t.zernioPostId) {
        try {
          await zernioDeletePost(t.zernioPostId)
        } catch {
          // Best-effort — still drop the local rows below.
        }
      }
    }
  }

  // Drop targets first (no ON DELETE reliance in the in-memory test fake), then
  // the parent.
  await db.delete(schema.socialPostTarget).where(eq(schema.socialPostTarget.socialPostId, postId))
  await db
    .delete(schema.socialPost)
    .where(and(eq(schema.socialPost.organizationId, orgId), eq(schema.socialPost.id, postId)))
  return { ok: true }
}

// ── Demo seeding ──────────────────────────────────────────────────────────────

/** A stock dental photo on the public-read S3 bucket (same pattern the demo
 *  hero/office photos use) so the history thumbnail renders without networking. */
const DEMO_POST_IMAGE =
  'https://dreamcrm-uploads-prod.s3.amazonaws.com/demo/gbp-post-whitening.jpg'

/** The demo's synthetic connected account ids (must match seedDemoZernio). */
const DEMO_GBP_ACCOUNT_ID = 'demo_gbp_dream_dental'
const DEMO_IG_ACCOUNT_ID = 'demo_ig_dream_dental'
const DEMO_FB_ACCOUNT_ID = 'demo_fb_dream_dental'

interface DemoTargetSeed {
  platform: string
  accountId: string
}

interface DemoPostSeed {
  externalId: string
  postType: GbpPostType
  summary: string
  imageUrl: string | null
  ctaType: GbpCtaType | null
  /** Filled with the clinic's real /book URL at seed time when ctaType=BOOK. */
  ctaUrl: string | null
  eventTitle: string | null
  eventStartDaysFromNow: number | null
  eventEndDaysFromNow: number | null
  offerCouponCode: string | null
  offerRedeemUrl: string | null
  offerTerms: string | null
  status: GbpPostStatus
  publishedDaysAgo: number | null
  scheduledDaysFromNow: number | null
  createdDaysAgo: number
  targets: DemoTargetSeed[]
}

const DEMO_SOCIAL_POSTS: DemoPostSeed[] = [
  {
    // A published CROSS-POST to GBP + Instagram + Facebook, with an image.
    externalId: 'demo_spost_1',
    postType: 'standard',
    summary:
      "New patients welcome! 🦷 We're booking same-week cleanings this month — gentle, judgment-free care from a team that actually listens. Tap below to grab a time online in under a minute.",
    imageUrl: DEMO_POST_IMAGE,
    ctaType: 'BOOK',
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
    targets: [
      { platform: GOOGLE_BUSINESS_PLATFORM, accountId: DEMO_GBP_ACCOUNT_ID },
      { platform: 'instagram', accountId: DEMO_IG_ACCOUNT_ID },
      { platform: 'facebook', accountId: DEMO_FB_ACCOUNT_ID },
    ],
  },
  {
    // A published GBP-only Offer with a coupon (preserves the Phase-2 demo).
    externalId: 'demo_spost_2',
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
    targets: [{ platform: GOOGLE_BUSINESS_PLATFORM, accountId: DEMO_GBP_ACCOUNT_ID }],
  },
  {
    // A SCHEDULED cross-post to Instagram + Facebook (social-only, no GBP).
    externalId: 'demo_spost_3',
    postType: 'standard',
    summary:
      'Behind the smiles 🪥 A peek at the team that makes every visit feel easy. Tag a friend who’s been putting off the dentist — we’ll take good care of them.',
    imageUrl: DEMO_POST_IMAGE,
    ctaType: null,
    ctaUrl: null,
    eventTitle: null,
    eventStartDaysFromNow: null,
    eventEndDaysFromNow: null,
    offerCouponCode: null,
    offerRedeemUrl: null,
    offerTerms: null,
    status: 'scheduled',
    publishedDaysAgo: null,
    scheduledDaysFromNow: 3,
    createdDaysAgo: 1,
    targets: [
      { platform: 'instagram', accountId: DEMO_IG_ACCOUNT_ID },
      { platform: 'facebook', accountId: DEMO_FB_ACCOUNT_ID },
    ],
  },
  {
    // A scheduled GBP Event (preserves the Phase-2 demo).
    externalId: 'demo_spost_4',
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
    targets: [{ platform: GOOGLE_BUSINESS_PLATFORM, accountId: DEMO_GBP_ACCOUNT_ID }],
  },
]

/**
 * Seed (or self-heal) the demo clinic's social posts so the Social Posts page +
 * content calendar showcase populated history (a published cross-post to
 * GBP+IG+FB with an image, a published GBP Offer, a scheduled social cross-post,
 * a scheduled GBP Event). Idempotent (insert-by synthetic id, skip when
 * present). Scoped to the isDemo org by the caller; behind a real-patient guard
 * (mirrors seedDemoZernio). NEVER networks. The Book CTA URL is the clinic's
 * real /book link.
 */
export async function seedDemoSocialPosts(organizationId: string): Promise<void> {
  // Prerequisite guard — only seed for a real demo org (one with patients).
  const [anyPatient] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, organizationId))
    .limit(1)
  if (!anyPatient) return

  // A connected (demo) channel must exist — the page reads the connection.
  const conn = await getZernioConnection(organizationId)
  if (conn.accounts.length === 0) return

  // Resolve the clinic's real /book URL for the Book CTA (honest demo).
  const bookUrl = await resolveDemoBookUrl(organizationId)

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  for (const seed of DEMO_SOCIAL_POSTS) {
    const postId = `spost_demo_${seed.externalId}`
    // Idempotent: skip if the parent already exists.
    const [existing] = await db
      .select({ id: schema.socialPost.id })
      .from(schema.socialPost)
      .where(eq(schema.socialPost.id, postId))
      .limit(1)
    if (existing) continue

    const createdAt = new Date(now - seed.createdDaysAgo * dayMs)
    const publishedAt = seed.publishedDaysAgo != null ? new Date(now - seed.publishedDaysAgo * dayMs) : null
    const scheduledAt = seed.scheduledDaysFromNow != null ? new Date(now + seed.scheduledDaysFromNow * dayMs) : null
    const eventStartAt =
      seed.eventStartDaysFromNow != null ? new Date(now + seed.eventStartDaysFromNow * dayMs) : null
    const eventEndAt = seed.eventEndDaysFromNow != null ? new Date(now + seed.eventEndDaysFromNow * dayMs) : null
    const ctaUrl = seed.ctaType === 'BOOK' ? bookUrl : seed.ctaUrl

    await db
      .insert(schema.socialPost)
      .values({
        id: postId,
        organizationId,
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
        publishedAt,
        isDemo: 1,
        createdAt,
        updatedAt: createdAt,
      })
      .onConflictDoNothing()

    for (const t of seed.targets) {
      await db
        .insert(schema.socialPostTarget)
        .values({
          id: `${postId}_t_${t.accountId}`,
          socialPostId: postId,
          organizationId,
          platform: t.platform,
          accountId: t.accountId,
          zernioPostId: `demo_zpost_${postId}_${t.platform}`,
          status: seed.status,
          googleUrl: seed.status === 'published' ? demoPermalink(t.platform) : null,
          lastError: null,
          publishedAt,
          createdAt,
          updatedAt: createdAt,
        })
        .onConflictDoNothing()
    }
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

// Re-export the post char constants so the page can size the composer.
export { GBP_POST_MAX_CHARS, SOCIAL_POST_MAX_CHARS }
