'use client'

import { useEffect, useState, useTransition, useCallback } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { BrandLogo, type BrandLogoId } from '@/components/integrations/brand-logos'
import type { PostCommentView, PostEngagementBundle, PostEngagementView } from '@/lib/types/zernio'
import {
  loadPostEngagementAction,
  replyToCommentAction,
  deleteCommentAction,
  setCommentHiddenAction,
  setCommentLikedAction,
} from '@/app/(default)/growth/social/comment-actions'

/**
 * Post-detail comment + engagement manager — opens over the Social Posts tablet
 * feed when staff click a post. Shows the post's real like / comment / share
 * counts and its comment thread, and lets them reply / like / hide / delete —
 * each action gated by the per-comment `can*` flags the Zernio API returns, so
 * the buttons only appear where the platform actually allows them. Honest about
 * what isn't available (Google Business → reviews; TikTok → none; the Inbox /
 * Analytics add-ons gate comments / counts). Mutations update the thread
 * optimistically so it feels live (demo + real alike).
 */

const BRAND_IDS: Record<string, BrandLogoId> = {
  googlebusiness: 'googlebusiness',
  instagram: 'instagram',
  facebook: 'facebook',
  tiktok: 'tiktok',
  youtube: 'youtube',
  linkedin: 'linkedin',
}

const PLATFORM_NAME: Record<string, string> = {
  googlebusiness: 'Google Business',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
}

export default function PostCommentsPanel({
  socialPostId,
  platform,
  summary,
  onClose,
}: {
  socialPostId: string
  platform: string
  summary: string
  onClose: () => void
}) {
  const [bundle, setBundle] = useState<PostEngagementBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const r = await loadPostEngagementAction(socialPostId, platform)
    if (r.ok) setBundle(r.bundle)
    else setError(r.error)
    setLoading(false)
  }, [socialPostId, platform])

  useEffect(() => {
    load()
  }, [load])

  // Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const name = PLATFORM_NAME[platform] ?? platform

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Comments on your ${name} post`}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          {BRAND_IDS[platform] && <BrandLogo id={BRAND_IDS[platform]} size={22} />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">{name} post</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{summary || 'Your post'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
              <button type="button" onClick={load} className="mt-2 text-sm font-medium text-teal-700 dark:text-teal-400 underline">
                Try again
              </button>
            </div>
          ) : bundle ? (
            <PanelBody bundle={bundle} socialPostId={socialPostId} platform={platform} setBundle={setBundle} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function PanelBody({
  bundle,
  socialPostId,
  platform,
  setBundle,
}: {
  bundle: PostEngagementBundle
  socialPostId: string
  platform: string
  setBundle: (b: PostEngagementBundle) => void
}) {
  if (!bundle.supported) {
    return <UnsupportedState reason={bundle.reason} platform={platform} />
  }

  return (
    <div>
      {bundle.engagement ? (
        <EngagementRow e={bundle.engagement} platform={platform} />
      ) : !bundle.analyticsAvailable ? (
        <Note>
          Turn on the <strong className="font-medium">Analytics add-on</strong> for this channel to see likes, reach,
          and impressions here.
        </Note>
      ) : null}

      {!bundle.commentsAvailable ? (
        <Note>
          Turn on the <strong className="font-medium">Comments add-on</strong> for this channel to read and reply to
          comments here.
        </Note>
      ) : (
        <CommentThread bundle={bundle} socialPostId={socialPostId} platform={platform} setBundle={setBundle} />
      )}
    </div>
  )
}

// ── Engagement stat row ──────────────────────────────────────────────────────

function EngagementRow({ e, platform }: { e: PostEngagementView; platform: string }) {
  // Show the universally meaningful counts; only show saves/views where the
  // platform produces them (Instagram saves, video views) and they're non-zero.
  const stats: Array<{ label: string; value: number }> = [
    { label: 'Likes', value: e.likes },
    { label: 'Comments', value: e.comments },
    { label: 'Shares', value: e.shares },
    { label: 'Impressions', value: e.impressions },
    { label: 'Reach', value: e.reach },
  ]
  if (platform === 'instagram' && e.saves > 0) stats.push({ label: 'Saves', value: e.saves })
  if (e.views > 0) stats.push({ label: 'Views', value: e.views })

  return (
    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-[color:var(--color-surface-sunk)] px-2 py-1.5 text-center">
            <p className="text-base font-semibold font-mono-num text-gray-900 dark:text-gray-100 leading-tight">
              {fmt(s.value)}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Comment thread + composer ────────────────────────────────────────────────

function CommentThread({
  bundle,
  socialPostId,
  platform,
  setBundle,
}: {
  bundle: PostEngagementBundle
  socialPostId: string
  platform: string
  setBundle: (b: PostEngagementBundle) => void
}) {
  const [pending, start] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
  const [draft, setDraft] = useState('')

  const comments = bundle.comments

  // Immutably replace the comment list (top-level + within replies).
  function setComments(next: PostCommentView[]) {
    setBundle({ ...bundle, comments: next })
  }
  function mapTree(list: PostCommentView[], id: string, fn: (c: PostCommentView) => PostCommentView): PostCommentView[] {
    return list.map((c) =>
      c.id === id ? fn(c) : { ...c, replies: mapTree(c.replies, id, fn) },
    )
  }
  function removeFromTree(list: PostCommentView[], id: string): PostCommentView[] {
    return list.filter((c) => c.id !== id).map((c) => ({ ...c, replies: removeFromTree(c.replies, id) }))
  }

  function run(
    optimistic: () => void,
    revert: () => void,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setActionError(null)
    optimistic()
    start(async () => {
      const r = await action()
      if (!r.ok) {
        revert()
        setActionError(r.error ?? 'That didn’t work.')
      }
    })
  }

  function submitReply() {
    const text = draft.trim()
    if (!text) return
    const tempId = `temp_${Date.now()}`
    const optimisticComment: PostCommentView = {
      id: tempId,
      message: text,
      createdTimeIso: new Date().toISOString(),
      authorName: 'You',
      authorHandle: null,
      authorPicture: null,
      isOwner: true,
      likeCount: 0,
      replyCount: 0,
      url: null,
      canReply: false,
      canDelete: true,
      canHide: false,
      canLike: false,
      isHidden: false,
      isLiked: false,
      likeUri: null,
      cid: null,
      replies: [],
    }
    const targetCommentId = replyTo?.id
    const snapshot = comments
    run(
      () => {
        if (targetCommentId) {
          setComments(mapTree(comments, targetCommentId, (c) => ({ ...c, replies: [...c.replies, optimisticComment] })))
        } else {
          setComments([optimisticComment, ...comments])
        }
        setDraft('')
        setReplyTo(null)
      },
      () => setComments(snapshot),
      () => replyToCommentAction(socialPostId, platform, text, targetCommentId),
    )
  }

  function del(id: string) {
    const snapshot = comments
    run(
      () => setComments(removeFromTree(comments, id)),
      () => setComments(snapshot),
      () => deleteCommentAction(socialPostId, platform, id),
    )
  }

  function toggleLike(c: PostCommentView) {
    const liked = !c.isLiked
    const snapshot = comments
    run(
      () =>
        setComments(
          mapTree(comments, c.id, (x) => ({
            ...x,
            isLiked: liked,
            likeCount: Math.max(0, x.likeCount + (liked ? 1 : -1)),
          })),
        ),
      () => setComments(snapshot),
      () => setCommentLikedAction(socialPostId, platform, c.id, liked, { cid: c.cid, likeUri: c.likeUri }),
    )
  }

  function toggleHide(c: PostCommentView) {
    const hidden = !c.isHidden
    const snapshot = comments
    run(
      () => setComments(mapTree(comments, c.id, (x) => ({ ...x, isHidden: hidden }))),
      () => setComments(snapshot),
      () => setCommentHiddenAction(socialPostId, platform, c.id, hidden),
    )
  }

  return (
    <div className="px-4 py-3">
      {comments.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
          No comments yet. When patients comment on this post, they’ll show up here.
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              c={c}
              depth={0}
              pending={pending}
              onReply={(cc) => setReplyTo({ id: cc.id, name: cc.authorName })}
              onDelete={del}
              onLike={toggleLike}
              onHide={toggleHide}
            />
          ))}
        </ul>
      )}

      {actionError && <p className="mt-2 text-xs text-rose-600" role="alert">{actionError}</p>}

      {/* Composer */}
      <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3">
        {replyTo && (
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>
              Replying to <strong className="font-medium text-gray-700 dark:text-gray-200">{replyTo.name}</strong>
            </span>
            <button type="button" onClick={() => setReplyTo(null)} className="underline hover:text-gray-700">
              Cancel
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder={replyTo ? `Reply to ${replyTo.name}…` : 'Write a reply…'}
            aria-label="Write a reply"
            className="form-textarea flex-1 text-sm resize-none"
          />
          <ActionButton variant="primary" size="sm" onClick={submitReply} disabled={pending || !draft.trim()}>
            {pending ? 'Sending…' : 'Send'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

function CommentRow({
  c,
  depth,
  pending,
  onReply,
  onDelete,
  onLike,
  onHide,
}: {
  c: PostCommentView
  depth: number
  pending: boolean
  onReply: (c: PostCommentView) => void
  onDelete: (id: string) => void
  onLike: (c: PostCommentView) => void
  onHide: (c: PostCommentView) => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  return (
    <li className={depth > 0 ? 'ml-6 pl-3 border-l-2 border-gray-100 dark:border-gray-800' : ''}>
      <div className="flex gap-2.5">
        <Avatar name={c.authorName} owner={c.isOwner} />
        <div className="flex-1 min-w-0">
          <div className="rounded-2xl bg-[color:var(--color-surface-sunk)] px-3 py-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{c.authorName}</span>
              {c.isOwner && (
                <span className="text-[10px] font-semibold text-teal-700 dark:text-teal-300 bg-teal-500/15 rounded px-1 py-0.5">
                  You
                </span>
              )}
              {c.isHidden && <span className="text-[10px] text-gray-400">· hidden</span>}
            </div>
            <p className={`text-sm whitespace-pre-wrap break-words ${c.isHidden ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-200'}`}>
              {c.message}
            </p>
          </div>
          {/* Action row — each gated by the per-comment capability flag. */}
          <div className="flex items-center gap-3 mt-1 px-1 text-xs text-gray-500">
            {c.createdTimeIso && <span>{timeAgo(c.createdTimeIso)}</span>}
            {c.likeCount > 0 && <span className="font-mono-num">{c.likeCount} likes</span>}
            {c.canLike && (
              <button type="button" onClick={() => onLike(c)} disabled={pending} className={`font-medium hover:underline ${c.isLiked ? 'text-teal-700 dark:text-teal-400' : ''}`}>
                {c.isLiked ? 'Liked' : 'Like'}
              </button>
            )}
            {c.canReply && (
              <button type="button" onClick={() => onReply(c)} disabled={pending} className="font-medium hover:underline">
                Reply
              </button>
            )}
            {c.canHide && (
              <button type="button" onClick={() => onHide(c)} disabled={pending} className="font-medium hover:underline">
                {c.isHidden ? 'Unhide' : 'Hide'}
              </button>
            )}
            {c.canDelete &&
              (confirmDel ? (
                <>
                  <button type="button" onClick={() => onDelete(c.id)} disabled={pending} className="font-medium text-rose-600 hover:underline">
                    Confirm
                  </button>
                  <button type="button" onClick={() => setConfirmDel(false)} disabled={pending} className="hover:underline">
                    Keep
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmDel(true)} disabled={pending} className="font-medium hover:text-rose-600 hover:underline">
                  Delete
                </button>
              ))}
          </div>

          {c.replies.length > 0 && (
            <ul className="mt-2 space-y-2">
              {c.replies.map((r) => (
                <CommentRow key={r.id} c={r} depth={depth + 1} pending={pending} onReply={onReply} onDelete={onDelete} onLike={onLike} onHide={onHide} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  )
}

// ── Unsupported / add-on states ──────────────────────────────────────────────

function UnsupportedState({ reason, platform }: { reason: string | null; platform: string }) {
  const name = PLATFORM_NAME[platform] ?? platform
  let body: React.ReactNode
  if (reason === 'googlebusiness') {
    body = (
      <>
        Google doesn’t use post comments — patient feedback comes in as <strong className="font-medium">reviews</strong>.
        Manage those in your{' '}
        <a href="/growth/reviews/received" className="font-medium text-teal-700 dark:text-teal-400 underline">
          Reviews
        </a>{' '}
        module.
      </>
    )
  } else if (reason === 'tiktok') {
    body = <>TikTok comments aren’t available through our connection yet — manage them in the TikTok app for now.</>
  } else if (reason === 'not_published') {
    body = <>This post hasn’t published to {name} yet, so there are no comments to manage.</>
  } else if (reason === 'not_connected') {
    body = (
      <>
        Reconnect {name} in{' '}
        <a href="/integrations" className="font-medium text-teal-700 dark:text-teal-400 underline">
          Integrations
        </a>{' '}
        to manage comments here.
      </>
    )
  } else {
    body = <>Comments aren’t available for this post right now.</>
  }
  return <div className="p-6 text-center text-sm text-gray-600 dark:text-gray-300">{body}</div>
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-4 my-3 text-xs text-gray-600 dark:text-gray-300 bg-amber-500/10 rounded-lg px-3 py-2">{children}</p>
  )
}

// ── Small bits ───────────────────────────────────────────────────────────────

function Avatar({ name, owner }: { name: string; owner: boolean }) {
  const initial = (name.replace(/[^A-Za-z]/g, '').charAt(0) || '?').toUpperCase()
  return (
    <span
      className={`inline-flex shrink-0 w-8 h-8 items-center justify-center rounded-full text-xs font-semibold text-white ${
        owner ? 'bg-teal-500' : 'bg-gray-400 dark:bg-gray-600'
      }`}
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
