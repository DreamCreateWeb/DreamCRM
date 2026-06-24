import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  listPostComments,
  replyToPostComment,
  deletePostComment,
  setPostCommentHidden,
  setPostCommentLiked,
  getPostEngagement,
  isInboxAddonError,
  isAnalyticsAddonError,
} from '@/lib/zernio'

/**
 * Comment + engagement client wrappers (the post-management surface). The fetch
 * boundary is mocked so the real client — URL/query/body building + defensive
 * parsing — is exercised without a live Zernio.
 */

function stub(body: unknown, ok = true, status = 200, statusText = 'OK') {
  const fn = vi.fn(async (..._args: unknown[]) => ({
    ok,
    status,
    statusText,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  process.env.ZERNIO_API_KEY = 'sk_test_zernio'
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.ZERNIO_API_KEY
})

describe('listPostComments', () => {
  it('parses the thread (author, capabilities, nested replies) and sends accountId', async () => {
    const fn = stub({
      status: 'ok',
      comments: [
        {
          id: 'c1',
          message: 'Do you take new patients?',
          createdTime: '2026-06-20T10:00:00Z',
          from: { name: 'Jamie Rivera', username: 'jamie.r', isOwner: false },
          likeCount: 3,
          replyCount: 1,
          canReply: true,
          canDelete: false,
          canHide: true,
          canLike: true,
          isLiked: false,
          replies: [{ id: 'c1r', message: 'Yes we do!', from: { name: 'Dream Dental', isOwner: true }, canDelete: true }],
        },
      ],
      pagination: { hasMore: false, cursor: null },
    })
    const res = await listPostComments('zp_1', 'acc_1', { limit: 50 })
    expect(res.comments).toHaveLength(1)
    const c = res.comments[0]
    expect(c.authorName).toBe('Jamie Rivera')
    expect(c.authorHandle).toBe('jamie.r')
    expect(c.canHide).toBe(true)
    expect(c.canDelete).toBe(false)
    expect(c.likeCount).toBe(3)
    expect(c.replies).toHaveLength(1)
    expect(c.replies[0].isOwner).toBe(true)
    // The account id rides the query string.
    const url = String(fn.mock.calls[0][0])
    expect(url).toContain('/inbox/comments/zp_1')
    expect(url).toContain('accountId=acc_1')
  })
})

describe('replyToPostComment', () => {
  it('POSTs accountId + message + commentId and returns the new id', async () => {
    const fn = stub({ success: true, data: { commentId: 'c2', isReply: true } })
    const res = await replyToPostComment('zp_1', { accountId: 'acc_1', message: 'Thanks!', commentId: 'c1' })
    expect(res.commentId).toBe('c2')
    const init = fn.mock.calls[0][1] as { method: string; body: string }
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ accountId: 'acc_1', message: 'Thanks!', commentId: 'c1' })
  })
})

describe('delete / hide / like wrappers', () => {
  it('deletePostComment passes accountId + commentId on the query', async () => {
    const fn = stub({ success: true, data: { message: 'deleted' } })
    await deletePostComment('zp_1', 'acc_1', 'c9')
    const url = String(fn.mock.calls[0][0])
    expect(url).toContain('accountId=acc_1')
    expect(url).toContain('commentId=c9')
    expect((fn.mock.calls[0][1] as { method: string }).method).toBe('DELETE')
  })

  it('setPostCommentHidden POSTs to /hide when hiding, DELETEs when unhiding', async () => {
    const a = stub({ status: 'ok', hidden: true })
    await setPostCommentHidden('zp_1', 'c1', 'acc_1', true)
    expect(String(a.mock.calls[0][0])).toContain('/inbox/comments/zp_1/c1/hide')
    expect((a.mock.calls[0][1] as { method: string }).method).toBe('POST')

    const b = stub({ status: 'ok', hidden: false })
    await setPostCommentHidden('zp_1', 'c1', 'acc_1', false)
    expect((b.mock.calls[0][1] as { method: string }).method).toBe('DELETE')
  })

  it('setPostCommentLiked returns the likeUri when liking', async () => {
    const fn = stub({ status: 'ok', liked: true, likeUri: 'at://like/1' })
    const res = await setPostCommentLiked('zp_1', 'c1', 'acc_1', true, { cid: 'cid1' })
    expect(res.likeUri).toBe('at://like/1')
    expect((fn.mock.calls[0][1] as { method: string }).method).toBe('POST')
  })
})

describe('getPostEngagement', () => {
  it('reduces the daily timeline to the latest cumulative row per platform', async () => {
    stub({
      postId: 'zp_1',
      timeline: [
        { date: '2026-06-19', platform: 'instagram', likes: 45, comments: 3, shares: 12, saves: 8, impressions: 1200, reach: 980 },
        { date: '2026-06-20', platform: 'instagram', likes: 92, comments: 7, shares: 21, saves: 15, impressions: 2400, reach: 1850 },
      ],
    })
    const map = await getPostEngagement('zp_1')
    expect(map.instagram.likes).toBe(92) // latest day wins (cumulative)
    expect(map.instagram.shares).toBe(21)
    expect(map.instagram.impressions).toBe(2400)
  })
})

describe('add-on error detection', () => {
  it('recognizes the Inbox (403) and Analytics (402) add-on errors', () => {
    expect(isInboxAddonError(new Error('Zernio API 403 Forbidden for /inbox/comments/zp_1: Inbox addon required'))).toBe(true)
    expect(isInboxAddonError(new Error('Zernio API 500 for /x'))).toBe(false)
    expect(isAnalyticsAddonError(new Error('Zernio API 402 for /analytics/post-timeline: analytics_addon_required'))).toBe(true)
    expect(isAnalyticsAddonError(new Error('Zernio API 403 for /x'))).toBe(false)
  })
})
