'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FlashToast } from '@/components/ui/flash-toast'
import { EmptyState } from '@/components/ui/empty-state'
import { TONE_TEXT } from '@/lib/ui/encodings'
import {
  syncGoogleReviewsAction,
  replyToGoogleReviewAction,
  draftGoogleReviewReplyAction,
  deleteGoogleReviewReplyAction,
  setGoogleReviewHiddenAction,
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
  hiddenFromSite: boolean
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
      <EmptyState
        icon="🔌"
        title="Connect your Google Business Profile to pull in real Google reviews"
        body="Once connected, the reviews patients leave on Google show up here — with their star rating and comment — and you can reply right from this page. The rating also powers the star snippet on your public website."
        action={
          <ActionButton variant="primary" size="sm" href="/integrations">
            Connect Google Business
          </ActionButton>
        }
      />
    </section>
  )
}

function ReviewCard({ row, featureMinStars }: { row: GoogleReviewClientRow; featureMinStars: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.replyComment ?? '')
  const [drafting, setDrafting] = useState(false)

  // AI draft → lands in the editor for review; never auto-posts.
  function aiDraft() {
    setError(null)
    setDrafting(true)
    void (async () => {
      try {
        const r = await draftGoogleReviewReplyAction(row.externalReviewId)
        if (r.ok) {
          setDraft(r.draft)
          setEditing(true)
        } else setError(r.error)
      } catch {
        setError('Could not draft a reply — try again in a moment.')
      } finally {
        setDrafting(false)
      }
    })()
  }

  // A review auto-features on the public site when its rating meets the clinic's
  // threshold AND it has a written comment — unless staff hid it here.
  const eligible =
    row.starRating != null && row.starRating >= featureMinStars && !!row.comment?.trim()

  function toggleHidden(hidden: boolean) {
    setError(null)
    startTransition(async () => {
      const r = await setGoogleReviewHiddenAction({ externalReviewId: row.externalReviewId, hidden })
      if (r.ok) {
        setToast(hidden ? 'Hidden from your website.' : 'Now showing on your website.')
        router.refresh()
      } else setError(r.error)
    })
  }

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
                <ActionButton variant="secondary" size="sm" onClick={aiDraft} disabled={pending || drafting}>
                  {drafting ? 'Drafting…' : '✨ Draft with AI'}
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
            <div className="flex items-center gap-2">
              <ActionButton variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={pending}>
                Reply
              </ActionButton>
              <ActionButton variant="ghost" size="sm" onClick={aiDraft} disabled={pending || drafting}>
                {drafting ? 'Drafting…' : '✨ Draft with AI'}
              </ActionButton>
            </div>
          )}
        </div>

        {/* ── Website feature status / hide toggle ──────────────────────── */}
        <div className="mt-4 pt-3 border-t border-[color:var(--color-hairline)] flex items-center justify-between gap-2 flex-wrap">
          {!eligible ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Not featured — needs {featureMinStars}★+ and a written comment.
            </p>
          ) : row.hiddenFromSite ? (
            <>
              <StatusPill tone="neutral" label="Hidden from website" title="You hid this review from your public site" />
              <ActionButton variant="secondary" size="sm" onClick={() => toggleHidden(false)} disabled={pending}>
                {pending ? 'Working…' : 'Show on website'}
              </ActionButton>
            </>
          ) : (
            <>
              <StatusPill tone="ok" label="Featured on website ✓" title="Auto-featured on your public site" />
              <ActionButton variant="ghost" size="sm" onClick={() => toggleHidden(true)} disabled={pending}>
                {pending ? 'Working…' : 'Hide from website'}
              </ActionButton>
            </>
          )}
        </div>

        {error && <p className={`text-xs mt-2 ${TONE_TEXT.urgent}`}>{error}</p>}
      </div>
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </li>
  )
}

export default function GoogleReviewsSection({
  rows,
  count,
  averageRating,
  featureMinStars = 4,
}: {
  rows: GoogleReviewClientRow[]
  count: number
  averageRating: number | null
  featureMinStars?: number
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
      {error && <p className={`text-xs mb-2 ${TONE_TEXT.urgent}`}>{error}</p>}
      {rows.length === 0 ? (
        <EmptyState
          icon="⭐"
          title="No Google reviews synced yet"
          body="Pull the latest from Google, or wait for the hourly sync."
          action={
            <ActionButton variant="secondary" size="sm" onClick={refresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh from Google'}
            </ActionButton>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <ReviewCard key={r.externalReviewId} row={r} featureMinStars={featureMinStars} />
          ))}
        </ul>
      )}
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </section>
  )
}
