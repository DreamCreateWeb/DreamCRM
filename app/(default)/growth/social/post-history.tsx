'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { TONE_DOT, type Tone } from '@/lib/ui/encodings'
import { GBP_POST_TYPE_LABELS, type SocialPostView, type SocialPostTargetView, type GbpPostStatus } from '@/lib/types/zernio'
import { isVideoUrl } from '@/lib/media'
import { BrandLogo, type BrandLogoId } from '@/components/integrations/brand-logos'
import { deleteSocialPostAction } from './actions'

/** Platform slugs with a brand-accurate logo (mirrors the composer). */
const BRAND_IDS: Record<string, BrandLogoId> = {
  googlebusiness: 'googlebusiness',
  instagram: 'instagram',
  facebook: 'facebook',
  tiktok: 'tiktok',
  youtube: 'youtube',
  linkedin: 'linkedin',
}

/**
 * Social-post history. Each card shows the post type badge (for GBP posts), the
 * summary preview, image thumb, the per-channel target chips (platform icon +
 * StatusPill + permalink), the relevant date, and delete. NO per-post metrics —
 * deprecated on Google, not yet pulled for the socials; we show publish state
 * honestly (local GBP performance is on /seo).
 */

// Publish status → tone. published = done (ok); scheduled = in flight (info);
// draft = inert (neutral); failed = needs our attention (urgent).
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

export default function PostHistory({ posts }: { posts: SocialPostView[] }) {
  return (
    <div className="space-y-3">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  )
}

function PostCard({ post }: { post: SocialPostView }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function remove() {
    setError(null)
    start(async () => {
      const r = await deleteSocialPostAction(post.id)
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

  // Only show a post-type badge when GBP is among the targets (it's GBP-only).
  const targetsGbp = post.targets.some((t) => t.platform === 'googlebusiness')

  return (
    <div className="v2-card p-4">
      <div className="flex gap-3.5">
        {post.imageUrl && (
          <div className="relative shrink-0 w-20 h-20 rounded-[var(--r-md)] overflow-hidden ring-1 ring-inset ring-[color:var(--color-hairline)] bg-black/5">
            {isVideoUrl(post.imageUrl) ? (
              <>
                <video src={post.imageUrl} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center text-white/90 text-lg drop-shadow" aria-hidden="true">▶</span>
              </>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {targetsGbp && post.postType !== 'standard' && (
                <span className="inline-flex items-center rounded-full bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] px-2 py-0.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {GBP_POST_TYPE_LABELS[post.postType]}
                </span>
              )}
              <StatusPill tone={STATUS_TONE[post.status]} label={STATUS_LABEL[post.status]} />
            </div>
            <span className="text-xs text-gray-400 font-mono-num shrink-0">{dateLabel}</span>
          </div>

          {/* Per-channel target chips */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {post.targets.map((t) => (
              <TargetChip key={t.id} target={t} />
            ))}
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

          {/* Per-target failure messages */}
          {post.targets
            .filter((t) => t.status === 'failed' && t.lastError)
            .map((t) => (
              <p
                key={`err-${t.id}`}
                className="mt-2 text-[12px] text-rose-700 dark:text-rose-300 bg-rose-500/10 rounded-[var(--r-md)] px-2.5 py-1.5"
              >
                {t.label}: {t.lastError}
              </p>
            ))}
          {error && (
            <p className="mt-2 text-[12px] text-rose-600" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** One channel's chip: brand logo + label + a status dot + optional permalink. */
function TargetChip({ target }: { target: SocialPostTargetView }) {
  const tone = STATUS_TONE[target.status]
  const dot = TONE_DOT[tone]
  const logoId = BRAND_IDS[target.platform]
  const inner = (
    <>
      {logoId ? (
        <BrandLogo id={logoId} size={14} className="shrink-0" />
      ) : (
        <span aria-hidden="true">{target.icon}</span>
      )}
      <span>{target.label}</span>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} title={STATUS_LABEL[target.status]} aria-label={STATUS_LABEL[target.status]} />
    </>
  )
  const base =
    'inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-gray-800 ring-1 ring-inset ring-[color:var(--color-hairline)] pl-1.5 pr-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-200'
  if (target.url) {
    return (
      <a
        href={target.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} hover:ring-teal-400`}
        title={`View on ${target.label} ↗`}
      >
        {inner}
        <span aria-hidden="true" className="text-gray-400">↗</span>
      </a>
    )
  }
  return <span className={base}>{inner}</span>
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
