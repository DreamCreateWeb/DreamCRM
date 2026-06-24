import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  listPostComments,
  getPostEngagement,
  replyToPostComment,
  deletePostComment,
  setPostCommentHidden,
  setPostCommentLiked,
  isInboxAddonError,
  isAnalyticsAddonError,
  zernioConfigured,
  type ZernioComment,
} from '@/lib/zernio'
import { getZernioConnection } from '@/lib/services/zernio'
import {
  commentsSupportedForPlatform,
  type PostCommentView,
  type PostEngagementBundle,
  type PostEngagementView,
} from '@/lib/types/zernio'

/**
 * Post comments + per-post engagement — the "manage your post" surface behind
 * the Social Posts tablet feed. Lets clinic staff click into a published post,
 * read its real comment thread, reply / like / hide / delete (driven by the
 * per-comment can* flags the API returns), and see real like / comment / share
 * counts.
 *
 * Discipline mirrors the other Zernio services EXACTLY:
 *   - DEMO-SAFE: a connection flagged `isDemo` NEVER hits the network — it
 *     returns deterministic synthetic comments + counts so the demo showcases
 *     the surface. Mutations on a demo connection are local no-ops that succeed.
 *   - BEST-EFFORT: never throws to the UI. Comments need Zernio's Inbox add-on
 *     (a 403) and engagement needs the Analytics add-on (a 402) — each is caught
 *     and reported as an availability flag, not an error. A platform that has no
 *     comments API (Google Business → reviews; TikTok → none) returns
 *     `supported:false` with a reason the UI phrases honestly.
 *
 * The client passes only (socialPostId, platform); we resolve the Zernio post id
 * + account id from `social_post_target` server-side (never exposed to the UI).
 */

interface ResolvedTarget {
  accountId: string
  zernioPostId: string
  published: boolean
}

/** Resolve a post's per-platform target (account + Zernio post id). */
async function resolveTarget(
  orgId: string,
  socialPostId: string,
  platform: string,
): Promise<ResolvedTarget | { error: 'not_found' | 'not_published' }> {
  const [row] = await db
    .select({
      accountId: schema.socialPostTarget.accountId,
      zernioPostId: schema.socialPostTarget.zernioPostId,
      status: schema.socialPostTarget.status,
    })
    .from(schema.socialPostTarget)
    .innerJoin(schema.socialPost, eq(schema.socialPostTarget.socialPostId, schema.socialPost.id))
    .where(
      and(
        eq(schema.socialPostTarget.socialPostId, socialPostId),
        eq(schema.socialPostTarget.platform, platform),
        eq(schema.socialPost.organizationId, orgId),
      ),
    )
    .limit(1)
  if (!row) return { error: 'not_found' }
  if (!row.zernioPostId) return { error: 'not_published' }
  return { accountId: row.accountId, zernioPostId: row.zernioPostId, published: row.status === 'published' }
}

function toView(c: ZernioComment): PostCommentView {
  return {
    id: c.id,
    message: c.message,
    createdTimeIso: c.createdTime,
    authorName: c.authorName,
    authorHandle: c.authorHandle,
    authorPicture: c.authorPicture,
    isOwner: c.isOwner,
    likeCount: c.likeCount,
    replyCount: c.replyCount,
    url: c.url,
    canReply: c.canReply,
    canDelete: c.canDelete,
    canHide: c.canHide,
    canLike: c.canLike,
    isHidden: c.isHidden,
    isLiked: c.isLiked,
    likeUri: c.likeUri,
    cid: c.cid,
    replies: c.replies.map(toView),
  }
}

function emptyBundle(platform: string, patch: Partial<PostEngagementBundle>): PostEngagementBundle {
  return {
    platform,
    supported: true,
    reason: null,
    commentsAvailable: false,
    analyticsAvailable: false,
    isDemo: false,
    engagement: null,
    comments: [],
    ...patch,
  }
}

/**
 * Load the comment thread + engagement for one post on one platform.
 */
export async function getPostEngagementBundle(
  orgId: string,
  socialPostId: string,
  platform: string,
): Promise<PostEngagementBundle> {
  // Platforms with no comments API → an honest, non-error "not supported" state.
  if (!commentsSupportedForPlatform(platform)) {
    return emptyBundle(platform, { supported: false, reason: platform })
  }

  const conn = await getZernioConnection(orgId)
  if (conn.status !== 'connected') {
    return emptyBundle(platform, { supported: false, reason: 'not_connected' })
  }

  const target = await resolveTarget(orgId, socialPostId, platform)
  if ('error' in target) {
    return emptyBundle(platform, { supported: false, reason: target.error === 'not_published' ? 'not_published' : 'not_found' })
  }

  // Demo connections: deterministic synthetic data, NEVER the network.
  if (conn.isDemo) {
    return {
      platform,
      supported: true,
      reason: null,
      commentsAvailable: true,
      analyticsAvailable: true,
      isDemo: true,
      engagement: demoEngagement(target.zernioPostId, platform),
      comments: demoComments(target.zernioPostId, platform),
    }
  }

  // Real connection — pull comments + engagement independently + best-effort.
  let comments: PostCommentView[] = []
  let commentsAvailable = true
  try {
    const res = await listPostComments(target.zernioPostId, target.accountId, { limit: 50 })
    comments = res.comments.map(toView)
  } catch (e) {
    if (isInboxAddonError(e)) commentsAvailable = false
    else commentsAvailable = true // a transient error — keep the surface, just empty
    comments = []
  }

  let engagement: PostEngagementView | null = null
  let analyticsAvailable = true
  try {
    const map = await getPostEngagement(target.zernioPostId)
    engagement = map[platform] ?? map[Object.keys(map)[0]] ?? null
  } catch (e) {
    if (isAnalyticsAddonError(e)) analyticsAvailable = false
    engagement = null
  }

  return {
    platform,
    supported: true,
    reason: null,
    commentsAvailable,
    analyticsAvailable,
    isDemo: false,
    engagement,
    comments,
  }
}

// ── Mutations (reply / delete / hide / like) ─────────────────────────────────

type MutationResult = { ok: true } | { ok: false; error: string }

async function withTarget(
  orgId: string,
  socialPostId: string,
  platform: string,
  fn: (t: ResolvedTarget, isDemo: boolean) => Promise<void>,
): Promise<MutationResult> {
  if (!zernioConfigured()) return { ok: false, error: 'Channel connections aren’t enabled on this instance.' }
  if (!commentsSupportedForPlatform(platform)) {
    return { ok: false, error: 'Comments aren’t available for this platform.' }
  }
  const conn = await getZernioConnection(orgId)
  if (conn.status !== 'connected') return { ok: false, error: 'That channel isn’t connected.' }
  const target = await resolveTarget(orgId, socialPostId, platform)
  if ('error' in target) return { ok: false, error: 'This post isn’t published to that channel yet.' }
  // Demo connections succeed locally without ever calling Zernio.
  if (conn.isDemo) return { ok: true }
  try {
    await fn(target, false)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function replyToPostCommentSvc(
  orgId: string,
  socialPostId: string,
  platform: string,
  message: string,
  commentId?: string,
): Promise<MutationResult> {
  const text = message.trim()
  if (!text) return Promise.resolve({ ok: false, error: 'Write a reply first.' })
  return withTarget(orgId, socialPostId, platform, (t) =>
    replyToPostComment(t.zernioPostId, { accountId: t.accountId, message: text, commentId }).then(() => undefined),
  )
}

export function deletePostCommentSvc(
  orgId: string,
  socialPostId: string,
  platform: string,
  commentId: string,
): Promise<MutationResult> {
  return withTarget(orgId, socialPostId, platform, (t) => deletePostComment(t.zernioPostId, t.accountId, commentId))
}

export function setPostCommentHiddenSvc(
  orgId: string,
  socialPostId: string,
  platform: string,
  commentId: string,
  hidden: boolean,
): Promise<MutationResult> {
  return withTarget(orgId, socialPostId, platform, (t) =>
    setPostCommentHidden(t.zernioPostId, commentId, t.accountId, hidden),
  )
}

export function setPostCommentLikedSvc(
  orgId: string,
  socialPostId: string,
  platform: string,
  commentId: string,
  liked: boolean,
  opts?: { cid?: string | null; likeUri?: string | null },
): Promise<MutationResult> {
  return withTarget(orgId, socialPostId, platform, (t) =>
    setPostCommentLiked(t.zernioPostId, commentId, t.accountId, liked, opts).then(() => undefined),
  )
}

// ── Demo synthetic data (deterministic per post + platform, never networks) ──

/** Tiny deterministic hash so the demo thread is stable across reloads. */
function seedNum(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

const DEMO_AUTHORS = [
  { name: 'Jamie Rivera', handle: 'jamie.rivera' },
  { name: 'Priya Nair', handle: 'priya_smiles' },
  { name: 'Marcus Lee', handle: 'marcuslee' },
  { name: 'Dana Whitfield', handle: 'danaw' },
  { name: 'Sofia Marín', handle: 'sofiam' },
]
const DEMO_TEXTS = [
  'Do you take new patients? My family just moved to the area!',
  'Just booked my cleaning — your front desk was so kind 😊',
  'How late are you open on Thursdays?',
  'Loved my whitening results, thank you!',
  'Is this covered by Delta Dental?',
  'My son needs a check-up — can I book for him too?',
]

/** Deterministic synthetic comments for the demo (with realistic can* flags). */
function demoComments(postId: string, platform: string): PostCommentView[] {
  const base = seedNum(postId + platform)
  const count = 2 + (base % 3) // 2–4 comments
  const out: PostCommentView[] = []
  for (let i = 0; i < count; i++) {
    const n = seedNum(`${postId}:${platform}:${i}`)
    const author = DEMO_AUTHORS[(base + i) % DEMO_AUTHORS.length]
    const owner = i === 1 // one comment from the clinic itself
    out.push({
      id: `demo_c_${postId}_${platform}_${i}`,
      message: owner ? 'Thanks so much — we’d love to see you! Tap “Book” on our profile. 💙' : DEMO_TEXTS[(n) % DEMO_TEXTS.length],
      createdTimeIso: new Date(1718900000000 - i * 5400000).toISOString(),
      authorName: owner ? 'Dream Dental' : author.name,
      authorHandle: owner ? 'dreamdental' : author.handle,
      authorPicture: null,
      isOwner: owner,
      likeCount: n % 9,
      replyCount: i === 0 ? 1 : 0,
      url: null,
      // Capabilities mirror the real platform support so every button shows in demo.
      canReply: true,
      canDelete: !owner,
      canHide: platform === 'facebook' || platform === 'instagram',
      canLike: platform === 'facebook',
      isHidden: false,
      isLiked: false,
      likeUri: null,
      cid: null,
      replies:
        i === 0
          ? [
              {
                id: `demo_c_${postId}_${platform}_${i}_r`,
                message: 'Yes! We’re welcoming new patients — call us or book online. 🦷',
                createdTimeIso: new Date(1718900000000 - i * 5400000 + 1800000).toISOString(),
                authorName: 'Dream Dental',
                authorHandle: 'dreamdental',
                authorPicture: null,
                isOwner: true,
                likeCount: 1,
                replyCount: 0,
                url: null,
                canReply: true,
                canDelete: true,
                canHide: false,
                canLike: false,
                isHidden: false,
                isLiked: false,
                likeUri: null,
                cid: null,
                replies: [],
              },
            ]
          : [],
    })
  }
  return out
}

function demoEngagement(postId: string, platform: string): PostEngagementView {
  const n = seedNum(postId + platform)
  return {
    likes: 40 + (n % 180),
    comments: 2 + (n % 5),
    shares: 1 + (n % 14),
    saves: platform === 'instagram' ? 5 + (n % 30) : 0,
    impressions: 800 + (n % 4200),
    reach: 600 + (n % 3200),
    views: platform === 'youtube' || platform === 'tiktok' ? 500 + (n % 9000) : 0,
    clicks: n % 60,
  }
}

/**
 * Documented no-op: demo comments + engagement are generated live whenever the
 * org's Zernio connection is `isDemo` (seeded by `seedDemoZernio`/`seedDemoSocialPosts`),
 * so there's nothing to persist. Kept for symmetry with the other seedDemo* hooks.
 */
export async function seedDemoPostComments(_organizationId: string): Promise<void> {
  void _organizationId
}
