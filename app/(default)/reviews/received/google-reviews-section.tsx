'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FlashToast } from '@/components/ui/flash-toast'
import {
  syncGoogleReviewsAction,
  replyToGoogleReviewAction,
  deleteGoogleReviewReplyAction,
} from '../actions'

export interface GoogleReviewClientRow {
  externalReviewId: string
  reviewerName: string | null
  reviewerPhotoUrl: string | null
  starRating: number | null
  comment: string | null
  reviewCreatedAtIso: string | null
  replyComment: string | null
  replyUpdatedAtIso: string | null
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

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5 stars`} className="inline-flex tabular-nums text-amber-500">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} aria-hidden="true" className={i < rating ? '' : 'opacity-25'}>
          ★
        </span>
      ))}
    </span>
  )
}

/** The "From Google" section header — Refresh button + average summary. */
function SectionHeader({
  count,
  averageRating,
  onRefresh,
  refreshing,
}: {
  count: number
  averageRating: number | null
  onRefresh: () => void
  refreshing: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">From Google</h2>
        <StatusPill tone="info" label="Google Business" title="Synced from your connected Google Business Profile" />
        {count > 0 && averageRating != null && (
          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums font-mono-num">
            {averageRating.toFixed(1)}★ · {count} {count === 1 ? 'review' : 'reviews'}
          </span>
        )}
      </div>
      <ActionButton variant="secondary" size="sm" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? 'Refreshing…' : 'Refresh from Google'}
      </ActionButton>
    </div>
  )
}

/** Empty state shown when no Google Business Profile is connected. */
export function GoogleConnectPrompt() {
  return (
    <section className="mb-10">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">From Google</h2>
      <div className="v2-card p-5">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
          Connect your Google Business Profile to pull in real Google reviews
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-300 mb-3 max-w-prose">
          Once connected, the reviews patients leave on Google show up here — with their star rating and
          comment — and you can reply right from this page. The rating also powers the star snippet on your
          public website.
        </p>
        <ActionButton variant="primary" size="sm" href="/integrations">
          Connect Google Business
        </ActionButton>
      </div>
    </section>
  )
}

function ReviewCard({ row }: { row: GoogleReviewClientRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.replyComment ?? '')

  function saveReply() {
    setError(null)
    startTransition(async () => {
      const r = await replyToGoogleReviewAction({ externalReviewId: row.externalReviewId, text: draft })
      if (r.ok) {
        setEditing(false)
        setToast('Reply posted to Google.')
        router.refresh()
      } else setError(r.error)
    })
  }

  function deleteReply() {
    setError(null)
    startTransition(async () => {
      const r = await deleteGoogleReviewReplyAction(row.externalReviewId)
      if (r.ok) {
        setDraft('')
        setToast('Reply removed.')
        router.refresh()
      } else setError(r.error)
    })
  }

  return (
    <li className="v2-card overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 dark:text-gray-100">
              {row.reviewerName ?? 'Google user'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{fmtRelative(row.reviewCreatedAtIso)}</p>
          </div>
          {row.starRating != null && <Stars rating={row.starRating} />}
        </div>

        {row.comment ? (
          <blockquote className="text-[15px] leading-[1.55] text-gray-800 dark:text-gray-100 whitespace-pre-wrap pl-3 border-l-2 border-[color:var(--color-hairline-strong)]">
            {row.comment}
          </blockquote>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            Rating only — this patient didn&apos;t leave a written comment.
          </p>
        )}

        {/* ── Existing reply / reply editor ─────────────────────────────── */}
        <div className="mt-4">
          {row.replyComment && !editing ? (
            <div className="v2-well p-3">
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1">
                Your reply{row.replyUpdatedAtIso ? ` · ${fmtRelative(row.replyUpdatedAtIso)}` : ''}
              </p>
              <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{row.replyComment}</p>
              <div className="mt-3 flex items-center gap-2">
                <ActionButton
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDraft(row.replyComment ?? '')
                    setEditing(true)
                  }}
                  disabled={pending}
                >
                  Edit reply
                </ActionButton>
                <ActionButton variant="danger" size="sm" onClick={deleteReply} disabled={pending}>
                  {pending ? 'Working…' : 'Delete reply'}
                </ActionButton>
              </div>
            </div>
          ) : editing ? (
            <div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="Write a warm, public reply…"
                className="w-full rounded-[var(--r-md)] border border-[color:var(--color-hairline-strong)] bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100"
              />
              <div className="mt-2 flex items-center gap-2">
                <ActionButton variant="primary" size="sm" onClick={saveReply} disabled={pending || !draft.trim()}>
                  {pending ? 'Posting…' : 'Post reply'}
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false)
                    setError(null)
                  }}
                  disabled={pending}
                >
                  Cancel
                </ActionButton>
              </div>
            </div>
          ) : (
            <ActionButton variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={pending}>
              Reply
            </ActionButton>
          )}
        </div>

        {error && <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
      </div>
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </li>
  )
}

export default function GoogleReviewsSection({
  rows,
  count,
  averageRating,
}: {
  rows: GoogleReviewClientRow[]
  count: number
  averageRating: number | null
}) {
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    setError(null)
    startRefresh(async () => {
      const r = await syncGoogleReviewsAction()
      if (r.ok) {
        setToast(r.skipped === 'demo' ? 'Demo reviews are up to date.' : `Synced ${r.synced} review${r.synced === 1 ? '' : 's'} from Google.`)
        router.refresh()
      } else setError(r.error)
    })
  }

  return (
    <section className="mb-10">
      <SectionHeader count={count} averageRating={averageRating} onRefresh={refresh} refreshing={refreshing} />
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">{error}</p>}
      {rows.length === 0 ? (
        <div className="v2-card p-5">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            No Google reviews synced yet. Click <span className="font-semibold">Refresh from Google</span> to pull
            the latest, or wait for the hourly sync.
          </p>
        </div>
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
