import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Post comments + engagement service (`getPostEngagementBundle` + the mutation
 * helpers). Mirrors the other Zernio services' discipline:
 *  - unsupported platform (Google Business / TikTok) → supported:false + reason;
 *  - DEMO connection → synthetic comments + counts, NEVER the network;
 *  - REAL connection → calls the client; a 403 degrades commentsAvailable, a 402
 *    degrades analyticsAvailable (never throws);
 *  - mutations: demo = local no-op success; unsupported platform = error.
 * The Zernio client + connection reader + the target lookup (db) are mocked.
 */

const client = {
  listPostComments: vi.fn(),
  getPostEngagement: vi.fn(),
  replyToPostComment: vi.fn(),
  deletePostComment: vi.fn(),
  setPostCommentHidden: vi.fn(),
  setPostCommentLiked: vi.fn(),
}
vi.mock('@/lib/zernio', async () => {
  const actual = await vi.importActual<typeof import('@/lib/zernio')>('@/lib/zernio')
  return {
    isInboxAddonError: actual.isInboxAddonError,
    isAnalyticsAddonError: actual.isAnalyticsAddonError,
    zernioConfigured: () => true,
    listPostComments: (...a: unknown[]) => client.listPostComments(...a),
    getPostEngagement: (...a: unknown[]) => client.getPostEngagement(...a),
    replyToPostComment: (...a: unknown[]) => client.replyToPostComment(...a),
    deletePostComment: (...a: unknown[]) => client.deletePostComment(...a),
    setPostCommentHidden: (...a: unknown[]) => client.setPostCommentHidden(...a),
    setPostCommentLiked: (...a: unknown[]) => client.setPostCommentLiked(...a),
  }
})

const conn = { value: { status: 'connected', isDemo: false, accounts: [] as unknown[] } }
vi.mock('@/lib/services/zernio', () => ({
  getZernioConnection: vi.fn(async () => conn.value),
}))

const state = { target: null as { accountId: string; zernioPostId: string | null; status: string } | null }
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  type Chain = Promise<unknown[]> & Record<string, unknown>
  function chain(): Chain {
    const p = Promise.resolve(state.target ? [state.target] : []) as Chain
    p.from = () => p
    p.innerJoin = () => p
    p.where = () => p
    p.limit = () => p
    return p
  }
  return { db: { select: () => chain() }, schema }
})

import {
  getPostEngagementBundle,
  replyToPostCommentSvc,
  deletePostCommentSvc,
} from '@/lib/services/social-comments'

beforeEach(() => {
  Object.values(client).forEach((f) => f.mockReset())
  conn.value = { status: 'connected', isDemo: false, accounts: [] }
  state.target = { accountId: 'acc_1', zernioPostId: 'zp_1', status: 'published' }
})

describe('getPostEngagementBundle — unsupported platforms', () => {
  it('Google Business → supported:false reason googlebusiness (no network, no db)', async () => {
    const b = await getPostEngagementBundle('org_1', 'sp_1', 'googlebusiness')
    expect(b.supported).toBe(false)
    expect(b.reason).toBe('googlebusiness')
    expect(client.listPostComments).not.toHaveBeenCalled()
  })
  it('TikTok → supported:false reason tiktok', async () => {
    const b = await getPostEngagementBundle('org_1', 'sp_1', 'tiktok')
    expect(b.supported).toBe(false)
    expect(b.reason).toBe('tiktok')
  })
})

describe('getPostEngagementBundle — connection + target guards', () => {
  it('not connected → supported:false reason not_connected', async () => {
    conn.value = { status: 'disconnected', isDemo: false, accounts: [] }
    const b = await getPostEngagementBundle('org_1', 'sp_1', 'instagram')
    expect(b.reason).toBe('not_connected')
  })
  it('target missing a Zernio post id → reason not_published', async () => {
    state.target = { accountId: 'acc_1', zernioPostId: null, status: 'failed' }
    const b = await getPostEngagementBundle('org_1', 'sp_1', 'instagram')
    expect(b.reason).toBe('not_published')
  })
})

describe('getPostEngagementBundle — demo connection', () => {
  it('returns synthetic comments + engagement and NEVER touches the network', async () => {
    conn.value = { status: 'connected', isDemo: true, accounts: [] }
    const b = await getPostEngagementBundle('org_demo', 'sp_1', 'instagram')
    expect(b.isDemo).toBe(true)
    expect(b.commentsAvailable).toBe(true)
    expect(b.comments.length).toBeGreaterThan(0)
    expect(b.engagement).not.toBeNull()
    expect(b.engagement!.likes).toBeGreaterThan(0)
    expect(client.listPostComments).not.toHaveBeenCalled()
    expect(client.getPostEngagement).not.toHaveBeenCalled()
  })
})

describe('getPostEngagementBundle — real connection', () => {
  it('pulls comments + engagement and reports both add-ons available', async () => {
    client.listPostComments.mockResolvedValue({
      comments: [
        { id: 'c1', message: 'hi', createdTime: null, authorName: 'A', authorHandle: null, authorPicture: null, isOwner: false, likeCount: 0, replyCount: 0, url: null, canReply: true, canDelete: false, canHide: false, canLike: false, isHidden: false, isLiked: false, likeUri: null, cid: null, replies: [] },
      ],
      hasMore: false,
      cursor: null,
    })
    client.getPostEngagement.mockResolvedValue({ instagram: { likes: 10, comments: 1, shares: 2, saves: 3, impressions: 100, reach: 80, views: 0, clicks: 5 } })
    const b = await getPostEngagementBundle('org_1', 'sp_1', 'instagram')
    expect(b.commentsAvailable).toBe(true)
    expect(b.analyticsAvailable).toBe(true)
    expect(b.comments).toHaveLength(1)
    expect(b.engagement!.likes).toBe(10)
    expect(client.listPostComments).toHaveBeenCalledWith('zp_1', 'acc_1', { limit: 50 })
  })

  it('a 403 on comments → commentsAvailable:false (others still load)', async () => {
    client.listPostComments.mockRejectedValue(new Error('Zernio API 403 Forbidden: Inbox addon required'))
    client.getPostEngagement.mockResolvedValue({ instagram: { likes: 5, comments: 0, shares: 0, saves: 0, impressions: 0, reach: 0, views: 0, clicks: 0 } })
    const b = await getPostEngagementBundle('org_1', 'sp_1', 'instagram')
    expect(b.commentsAvailable).toBe(false)
    expect(b.comments).toEqual([])
    expect(b.engagement!.likes).toBe(5)
  })

  it('a 402 on analytics → analyticsAvailable:false (comments still load)', async () => {
    client.listPostComments.mockResolvedValue({ comments: [], hasMore: false, cursor: null })
    client.getPostEngagement.mockRejectedValue(new Error('Zernio API 402: analytics_addon_required'))
    const b = await getPostEngagementBundle('org_1', 'sp_1', 'instagram')
    expect(b.analyticsAvailable).toBe(false)
    expect(b.engagement).toBeNull()
    expect(b.commentsAvailable).toBe(true)
  })
})

describe('mutations', () => {
  it('demo reply succeeds locally without calling Zernio', async () => {
    conn.value = { status: 'connected', isDemo: true, accounts: [] }
    const r = await replyToPostCommentSvc('org_demo', 'sp_1', 'instagram', 'Thanks!')
    expect(r.ok).toBe(true)
    expect(client.replyToPostComment).not.toHaveBeenCalled()
  })
  it('real reply calls the client with the resolved target', async () => {
    client.replyToPostComment.mockResolvedValue({ commentId: 'c9' })
    const r = await replyToPostCommentSvc('org_1', 'sp_1', 'instagram', 'Thanks!', 'c1')
    expect(r.ok).toBe(true)
    expect(client.replyToPostComment).toHaveBeenCalledWith('zp_1', { accountId: 'acc_1', message: 'Thanks!', commentId: 'c1' })
  })
  it('reply on an unsupported platform is rejected', async () => {
    const r = await replyToPostCommentSvc('org_1', 'sp_1', 'googlebusiness', 'hi')
    expect(r.ok).toBe(false)
  })
  it('an empty reply is rejected before any network call', async () => {
    const r = await replyToPostCommentSvc('org_1', 'sp_1', 'instagram', '   ')
    expect(r.ok).toBe(false)
    expect(client.replyToPostComment).not.toHaveBeenCalled()
  })
  it('real delete calls the client', async () => {
    client.deletePostComment.mockResolvedValue(undefined)
    const r = await deletePostCommentSvc('org_1', 'sp_1', 'facebook', 'c5')
    expect(r.ok).toBe(true)
    expect(client.deletePostComment).toHaveBeenCalledWith('zp_1', 'acc_1', 'c5')
  })
})
