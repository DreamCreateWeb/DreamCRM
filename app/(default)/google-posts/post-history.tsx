'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import type { Tone } from '@/lib/ui/encodings'
import { GBP_POST_TYPE_LABELS, type GbpPostView, type GbpPostStatus } from '@/lib/types/zernio'
import { deleteGbpPostAction } from './actions'

/**
 * GBP post history. Each card shows the type badge, summary preview, image
 * thumb, status pill, the relevant date (published or scheduled), a "View on
 * Google" link when a permalink exists, and delete. NO per-post metrics — Google
 * deprecated them; we show publish state honestly (local performance is on /seo).
 */

// Publish status → tone. published = done (ok); scheduled = in flight, will run
// (info); draft = inert (neutral); failed = needs our attention (urgent).
const STATUS_TONE: Record<GbpPostStatus, Tone> = {
  published: 'ok',
  scheduled: 'info',
  draft: 'neutral',
  failed: 'urgent',
}
const STATUS_LABEL: Record<GbpPostStatus, string> = {
  published: 'Published',
  scheduled: 'Scheduled',
  draft: 'Draft',
  failed: 'Failed',
}

export default function PostHistory({ posts }: { posts: GbpPostView[] }) {
  return (
    <div className="space-y-3">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  )
}

function PostCard({ post }: { post: GbpPostView }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(post.lastError)
  const [confirming, setConfirming] = useState(false)

  function remove() {
    setError(null)
    start(async () => {
      const r = await deleteGbpPostAction(post.id)
      if (!r.ok) setError(r.error ?? 'Could not delete the post.')
      else router.refresh()
    })
  }

  const dateLabel =
    post.status === 'scheduled' && post.scheduledAtIso
      ? `Scheduled for ${formatDate(post.scheduledAtIso)}`
      : post.publishedAtIso
        ? `Published ${formatDate(post.publishedAtIso)}`
        : `Created ${formatDate(post.createdAtIso)}`

  return (
    <div className="v2-card p-4">
      <div className="flex gap-3">
        {post.imageUrl && (
          <div className="shrink-0 w-16 h-16 rounded-[var(--r-md)] overflow-hidden ring-1 ring-inset ring-[color:var(--color-hairline)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="inline-flex items-center rounded-full bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              {GBP_POST_TYPE_LABELS[post.postType]}
            </span>
            <StatusPill tone={STATUS_TONE[post.status]} label={STATUS_LABEL[post.status]} />
            <span className="text-[11px] text-gray-400 font-mono-num">{dateLabel}</span>
          </div>

          {post.postType === 'event' && post.eventTitle && (
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{post.eventTitle}</p>
          )}
          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 whitespace-pre-wrap">{post.summary}</p>

          {(post.ctaType || post.offerCouponCode) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-500 dark:text-gray-400">
              {post.ctaType && (
                <span>
                  Button: <span className="font-medium text-gray-700 dark:text-gray-200">{ctaLabel(post.ctaType)}</span>
                </span>
              )}
              {post.offerCouponCode && (
                <span>
                  Code: <span className="font-mono-num font-medium text-gray-700 dark:text-gray-200">{post.offerCouponCode}</span>
                </span>
              )}
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {post.googleUrl && (
              <ActionButton variant="ghost" size="sm" href={post.googleUrl} target="_blank" rel="noopener noreferrer">
                View on Google ↗
              </ActionButton>
            )}
            {confirming ? (
              <>
                <ActionButton variant="danger" size="sm" onClick={remove} disabled={pending}>
                  {pending ? 'Deleting…' : 'Confirm delete'}
                </ActionButton>
                <ActionButton variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
                  Keep
                </ActionButton>
              </>
            ) : (
              <ActionButton variant="ghost" size="sm" onClick={() => setConfirming(true)} disabled={pending}>
                Delete
              </ActionButton>
            )}
          </div>

          {post.status === 'failed' && error && (
            <p className="mt-2 text-[12px] text-rose-700 dark:text-rose-300 bg-rose-500/10 rounded-[var(--r-md)] px-2.5 py-1.5">
              {error}
            </p>
          )}
          {post.status !== 'failed' && error && (
            <p className="mt-2 text-[12px] text-rose-600" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const CTA_DISPLAY: Record<string, string> = {
  LEARN_MORE: 'Learn more',
  BOOK: 'Book',
  ORDER: 'Order online',
  SHOP: 'Shop',
  SIGN_UP: 'Sign up',
  CALL: 'Call now',
}
function ctaLabel(t: string): string {
  return CTA_DISPLAY[t] ?? t
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
