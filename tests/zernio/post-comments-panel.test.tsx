import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { PostCommentView, PostEngagementBundle } from '@/lib/types/zernio'

/**
 * Post comment + engagement manager panel. The server actions are mocked, so the
 * panel's own logic — loading, the stat row, capability-gated buttons, and the
 * optimistic reply/delete/like flows — is exercised without a server.
 */

const actions = {
  load: vi.fn(),
  reply: vi.fn(async () => ({ ok: true })),
  del: vi.fn(async () => ({ ok: true })),
  hide: vi.fn(async () => ({ ok: true })),
  like: vi.fn(async () => ({ ok: true })),
}
vi.mock('@/app/(default)/growth/social/comment-actions', () => ({
  loadPostEngagementAction: (...a: unknown[]) => actions.load(...(a as [])),
  replyToCommentAction: (...a: unknown[]) => actions.reply(...(a as [])),
  deleteCommentAction: (...a: unknown[]) => actions.del(...(a as [])),
  setCommentHiddenAction: (...a: unknown[]) => actions.hide(...(a as [])),
  setCommentLikedAction: (...a: unknown[]) => actions.like(...(a as [])),
}))

import PostCommentsPanel from '@/components/social-posts/post-comments-panel'

function comment(over: Partial<PostCommentView> = {}): PostCommentView {
  return {
    id: 'c1',
    message: 'Do you take new patients?',
    createdTimeIso: '2026-06-20T10:00:00Z',
    authorName: 'Jamie Rivera',
    authorHandle: 'jamie',
    authorPicture: null,
    isOwner: false,
    likeCount: 2,
    replyCount: 0,
    url: null,
    canReply: true,
    canDelete: true,
    canHide: true,
    canLike: true,
    isHidden: false,
    isLiked: false,
    likeUri: null,
    cid: null,
    replies: [],
    ...over,
  }
}

function bundle(over: Partial<PostEngagementBundle> = {}): PostEngagementBundle {
  return {
    platform: 'instagram',
    supported: true,
    reason: null,
    commentsAvailable: true,
    analyticsAvailable: true,
    isDemo: false,
    engagement: { likes: 92, comments: 7, shares: 21, saves: 15, impressions: 2400, reach: 1850, views: 0, clicks: 48 },
    comments: [comment()],
    ...over,
  }
}

function open(b: PostEngagementBundle) {
  actions.load.mockResolvedValue({ ok: true, bundle: b })
  return render(<PostCommentsPanel socialPostId="sp_1" platform={b.platform} summary="Same-week cleanings" onClose={() => {}} />)
}

beforeEach(() => {
  Object.values(actions).forEach((f) => f.mockReset?.())
  actions.reply.mockResolvedValue({ ok: true })
  actions.del.mockResolvedValue({ ok: true })
  actions.hide.mockResolvedValue({ ok: true })
  actions.like.mockResolvedValue({ ok: true })
})

describe('PostCommentsPanel — load + render', () => {
  it('shows the engagement stats and the comment thread', async () => {
    open(bundle())
    expect(await screen.findByText('Jamie Rivera')).toBeTruthy()
    expect(screen.getByText('Do you take new patients?')).toBeTruthy()
    // Stats row.
    expect(screen.getByText('Shares')).toBeTruthy()
    expect(screen.getByText('92')).toBeTruthy() // likes
  })

  it('only renders the actions a comment supports (capability flags)', async () => {
    open(bundle({ comments: [comment({ canLike: false, canHide: false, canDelete: false, canReply: true })] }))
    await screen.findByText('Jamie Rivera')
    expect(screen.getByRole('button', { name: 'Reply' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Like' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })
})

describe('PostCommentsPanel — actions', () => {
  it('reply optimistically appears and calls the action', async () => {
    open(bundle())
    await screen.findByText('Jamie Rivera')
    fireEvent.change(screen.getByLabelText('Write a reply'), { target: { value: 'Yes, we are!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(screen.getByText('Yes, we are!')).toBeTruthy() // optimistic
    await waitFor(() => expect(actions.reply).toHaveBeenCalledWith('sp_1', 'instagram', 'Yes, we are!', undefined))
  })

  it('delete optimistically removes the comment after confirm', async () => {
    open(bundle())
    await screen.findByText('Jamie Rivera')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.queryByText('Do you take new patients?')).toBeNull())
    expect(actions.del).toHaveBeenCalledWith('sp_1', 'instagram', 'c1')
  })

  it('like toggles and calls the action', async () => {
    open(bundle())
    await screen.findByText('Jamie Rivera')
    fireEvent.click(screen.getByRole('button', { name: 'Like' }))
    await waitFor(() => expect(actions.like).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Liked' })).toBeTruthy()
  })
})

describe('PostCommentsPanel — honest states', () => {
  it('Google Business → points at the Reviews module, no comment thread', async () => {
    open(bundle({ platform: 'googlebusiness', supported: false, reason: 'googlebusiness', comments: [], engagement: null }))
    expect(await screen.findByRole('link', { name: 'Reviews' })).toBeTruthy()
    expect(screen.queryByLabelText('Write a reply')).toBeNull()
  })

  it('Inbox add-on off → an honest note instead of the thread', async () => {
    open(bundle({ commentsAvailable: false, comments: [] }))
    expect(await screen.findByText(/Comments add-on/)).toBeTruthy()
    expect(screen.queryByLabelText('Write a reply')).toBeNull()
  })

  it('Analytics add-on off → an honest note instead of the stat row', async () => {
    open(bundle({ analyticsAvailable: false, engagement: null }))
    expect(await screen.findByText(/Analytics add-on/)).toBeTruthy()
  })
})
