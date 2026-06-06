'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  featureReviewAsTestimonialAction,
  unfeatureReviewTestimonialAction,
} from '../actions'

type ReviewSite = 'google' | 'healthgrades' | 'facebook' | 'yelp'

const PLATFORM_LABEL: Record<ReviewSite, string> = {
  google: 'Google',
  healthgrades: 'Healthgrades',
  facebook: 'Facebook',
  yelp: 'Yelp',
}

const PLATFORM_PILL: Record<ReviewSite, string> = {
  google: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  healthgrades: 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300',
  facebook: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
  yelp: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
}

export interface ReceivedRow {
  id: string
  patientId: string
  patientFirstName: string
  patientLastName: string
  patientCity: string | null
  patientState: string | null
  completedAtIso: string | null
  selectedSite: ReviewSite | null
  reviewText: string | null
  rating: number | null
  isFeatured: boolean
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  const days = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000))
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtLocation(row: ReceivedRow): string {
  const c = row.patientCity?.trim()
  const s = row.patientState?.trim()
  if (c && s) return `${c}, ${s}`
  return c || s || ''
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5 stars`} className="inline-flex tabular-nums text-amber-500">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} aria-hidden="true" className={i < rating ? '' : 'opacity-25'}>★</span>
      ))}
    </span>
  )
}

export default function ReceivedList({ rows }: { rows: ReceivedRow[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <ReviewCard key={r.id} row={r} />
      ))}
    </ul>
  )
}

function ReviewCard({ row }: { row: ReceivedRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function feature() {
    setError(null)
    startTransition(async () => {
      const r = await featureReviewAsTestimonialAction({ patientId: row.patientId, reviewRequestId: row.id })
      if (r.ok) router.refresh()
      else setError(r.error)
    })
  }

  function unfeature() {
    setError(null)
    startTransition(async () => {
      const r = await unfeatureReviewTestimonialAction(row.patientId)
      if (r.ok) router.refresh()
      else setError(r.error)
    })
  }

  return (
    <li className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
      <div className="p-4 sm:p-5">
        {/* ── Header row: patient + platform + when + featured pill ─── */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div className="min-w-0">
            <Link
              href={`/patients/${row.patientId}`}
              className="font-semibold text-stone-800 dark:text-stone-100 hover:underline"
            >
              {row.patientFirstName} {row.patientLastName}
            </Link>
            <p className="text-[11px] text-stone-400 dark:text-stone-500">
              {fmtLocation(row) && <span>{fmtLocation(row)} · </span>}
              {fmtRelative(row.completedAtIso)}
              {row.selectedSite && (
                <>
                  {' · also shared on '}
                  <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ml-0.5 ${PLATFORM_PILL[row.selectedSite]}`}>
                    {PLATFORM_LABEL[row.selectedSite]}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {row.rating != null && <Stars rating={row.rating} />}
            {row.isFeatured && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                ✓ Featured
              </span>
            )}
          </div>
        </div>

        {/* ── The review text ───────────────────────────────────────── */}
        {row.reviewText ? (
          <blockquote className="text-[15px] leading-[1.55] text-stone-800 dark:text-stone-100 whitespace-pre-wrap pl-3 border-l-2 border-stone-200 dark:border-stone-700/60 italic">
            &ldquo;{row.reviewText}&rdquo;
          </blockquote>
        ) : (
          <div className="text-[13px] text-stone-500 dark:text-stone-400 italic bg-stone-50 dark:bg-stone-800/40 rounded-lg p-3">
            This patient went straight to a third-party platform without leaving a copy here.
            Their review lives on{' '}
            {row.selectedSite ? PLATFORM_LABEL[row.selectedSite] : 'the public-review site they picked'}
            , so there&apos;s no text for us to feature.
          </div>
        )}

        {/* ── Toggle action ─────────────────────────────────────────── */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[11px] text-stone-400 dark:text-stone-500">
            {row.isFeatured
              ? "Showing as a testimonial on your public site."
              : row.reviewText
                ? 'Privacy-safe display label is set from this patient — "First L." + city.'
                : ''}
          </p>
          {row.reviewText && (
            <button
              type="button"
              onClick={row.isFeatured ? unfeature : feature}
              disabled={pending}
              className={
                row.isFeatured
                  ? 'text-[12px] font-semibold px-3 py-1.5 rounded-md border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 disabled:opacity-50'
                  : 'text-[12px] font-semibold px-3 py-1.5 rounded-md bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 disabled:opacity-50'
              }
            >
              {pending
                ? 'Saving…'
                : row.isFeatured
                  ? 'Remove from website'
                  : 'Feature on website →'}
            </button>
          )}
        </div>

        {error && <p className="text-[12px] text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
      </div>
    </li>
  )
}
