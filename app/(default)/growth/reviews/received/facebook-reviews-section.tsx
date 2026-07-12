'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FlashToast } from '@/components/ui/flash-toast'
import { EmptyState } from '@/components/ui/empty-state'
import { TONE_TEXT } from '@/lib/ui/encodings'
import { syncFacebookReviewsAction } from '../actions'

export interface FacebookReviewClientRow {
  externalReviewId: string
  reviewerName: string | null
  reviewerPhotoUrl: string | null
  recommendationType: 'recommended' | 'not_recommended' | null
  comment: string | null
  reviewCreatedAtIso: string | null
}

function fmtRelative(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const days = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000))
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Recommend / don't-recommend pill — Facebook's model (no stars). */
function RecommendBadge({ type }: { type: 'recommended' | 'not_recommended' | null }) {
  if (type === 'recommended') {
    return <StatusPill tone="ok" label="Recommends" title="This person recommends your practice on Facebook" />
  }
  if (type === 'not_recommended') {
    return (
      <StatusPill
        tone="urgent"
        label="Doesn't recommend"
        title="This person does not recommend your practice on Facebook"
      />
    )
  }
  return null
}

function ReviewCard({ row }: { row: FacebookReviewClientRow }) {
  return (
    <li className="v2-card overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 dark:text-gray-100">
              {row.reviewerName ?? 'Facebook user'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{fmtRelative(row.reviewCreatedAtIso)}</p>
          </div>
          <RecommendBadge type={row.recommendationType} />
        </div>

        {row.comment ? (
          <blockquote className="text-[15px] leading-[1.55] text-gray-800 dark:text-gray-100 whitespace-pre-wrap pl-3 border-l-2 border-[color:var(--color-hairline-strong)]">
            {row.comment}
          </blockquote>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            {row.recommendationType === 'recommended'
              ? 'Recommends your practice — no written comment.'
              : 'Left a recommendation — no written comment.'}
          </p>
        )}

        {/* Facebook replies aren't available through our connection, so this is
            read-only with an honest link-out to reply on Facebook itself. */}
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          To respond, reply from your{' '}
          <a
            href="https://www.facebook.com/"
            target="_blank"
            rel="noreferrer"
            className="text-teal-700 dark:text-teal-400 hover:underline"
          >
            Facebook Page
          </a>
          .
        </p>
      </div>
    </li>
  )
}

export default function FacebookReviewsSection({
  rows,
  recommended,
  notRecommended,
}: {
  rows: FacebookReviewClientRow[]
  recommended: number
  notRecommended: number
}) {
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const total = recommended + notRecommended

  function refresh() {
    setError(null)
    startRefresh(async () => {
      const r = await syncFacebookReviewsAction()
      if (r.ok) {
        setToast(
          r.skipped === 'demo'
            ? 'Demo recommendations are up to date.'
            : `Synced ${r.synced} recommendation${r.synced === 1 ? '' : 's'} from Facebook.`,
        )
        router.refresh()
      } else setError(r.error)
    })
  }

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">From Facebook</h2>
          <StatusPill tone="info" label="Facebook" title="Synced from your connected Facebook Page" />
          {total > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums font-mono-num">
              {recommended} recommend{recommended === 1 ? 's' : ''}
              {notRecommended > 0 ? ` · ${notRecommended} don't` : ''}
            </span>
          )}
        </div>
        <ActionButton variant="secondary" size="sm" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh from Facebook'}
        </ActionButton>
      </div>
      {error && <p className={`text-xs mb-2 ${TONE_TEXT.urgent}`}>{error}</p>}
      {rows.length === 0 ? (
        <EmptyState
          icon="👍"
          title="No Facebook recommendations synced yet"
          body="Pull the latest from Facebook, or wait for the hourly sync. Facebook uses a recommend / don't-recommend model rather than star ratings, so these don't affect your website's Google star rating."
          action={
            <ActionButton variant="secondary" size="sm" onClick={refresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh from Facebook'}
            </ActionButton>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <ReviewCard key={r.externalReviewId} row={r} />
          ))}
        </ul>
      )}
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </section>
  )
}
