'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FlashToast } from '@/components/ui/flash-toast'
import type { Tone } from '@/lib/ui/encodings'
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

// The "also shared on" tag is an FYI of where the review lives — Google is
// the primary surface (info); the rest are inert labels (neutral).
const PLATFORM_TONE: Record<ReviewSite, Tone> = {
  google: 'info',
  healthgrades: 'neutral',
  facebook: 'neutral',
  yelp: 'neutral',
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
  /** The visit that triggered the request, when linked. */
  appointmentId: string | null
  appointmentDateIso: string | null
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

/** "Jun 3" / "Jun 3, 2025" — the visit that triggered the review request. */
function fmtVisitDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
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
  const [toast, setToast] = useState<string | null>(null)

  function feature() {
    setError(null)
    startTransition(async () => {
      const r = await featureReviewAsTestimonialAction({ patientId: row.patientId, reviewRequestId: row.id })
      if (r.ok) {
        setToast('Featured on your website.')
        router.refresh()
      } else setError(r.error)
    })
  }

  function unfeature() {
    setError(null)
    startTransition(async () => {
      const r = await unfeatureReviewTestimonialAction(row.patientId)
      if (r.ok) {
        setToast('Removed from your website.')
        router.refresh()
      } else setError(r.error)
    })
  }

  return (
    <li className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700/60 overflow-hidden">
      <div className="p-4 sm:p-5">
        {/* ── Header row: patient + platform + when + featured pill ─── */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div className="min-w-0">
            <Link
              href={`/patients/${row.patientId}`}
              className="font-semibold text-gray-800 dark:text-gray-100 hover:underline"
            >
              {row.patientFirstName} {row.patientLastName}
            </Link>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center flex-wrap gap-x-1">
              {fmtLocation(row) && <span>{fmtLocation(row)} ·</span>}
              <span>{fmtRelative(row.completedAtIso)}</span>
              {row.selectedSite && (
                <>
                  <span>· also shared on</span>
                  <StatusPill tone={PLATFORM_TONE[row.selectedSite]} label={PLATFORM_LABEL[row.selectedSite]} />
                </>
              )}
            </p>
            {fmtVisitDate(row.appointmentDateIso) && (
              <Link
                href={`/patients/${row.patientId}#timeline`}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:underline"
                title="See this visit on the patient timeline"
              >
                After their {fmtVisitDate(row.appointmentDateIso)} visit
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {row.rating != null && <Stars rating={row.rating} />}
            {row.isFeatured && <StatusPill tone="special" label="✓ Featured" title="Showing on your public website" />}
          </div>
        </div>

        {/* ── The review text ───────────────────────────────────────── */}
        {row.reviewText ? (
          <blockquote className="text-[15px] leading-[1.55] text-gray-800 dark:text-gray-100 whitespace-pre-wrap pl-3 border-l-2 border-gray-200 dark:border-gray-700/60 italic">
            &ldquo;{row.reviewText}&rdquo;
          </blockquote>
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400 italic bg-stone-50 dark:bg-gray-900/40 rounded-lg p-3">
            This patient went straight to a third-party platform without leaving a copy here.
            Their review lives on{' '}
            {row.selectedSite ? PLATFORM_LABEL[row.selectedSite] : 'the public-review site they picked'}
            , so there&apos;s no text for us to feature.
          </div>
        )}

        {/* ── Toggle action ─────────────────────────────────────────── */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {row.isFeatured
              ? 'Showing as a testimonial on your public site.'
              : row.reviewText
                ? 'Privacy-safe display label is set from this patient — "First L." + city.'
                : ''}
          </p>
          {row.reviewText && (
            <ActionButton
              variant={row.isFeatured ? 'secondary' : 'primary'}
              size="sm"
              onClick={row.isFeatured ? unfeature : feature}
              disabled={pending}
              className="shrink-0"
            >
              {pending
                ? 'Saving…'
                : row.isFeatured
                  ? 'Remove from website'
                  : 'Feature on website →'}
            </ActionButton>
          )}
        </div>

        {error && <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
      </div>

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </li>
  )
}
