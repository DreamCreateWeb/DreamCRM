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

function defaultAuthorLabel(row: ReceivedRow): string {
  const init = (row.patientLastName.trim()[0] ?? '').toUpperCase()
  return init ? `${row.patientFirstName} ${init}.` : row.patientFirstName
}

function defaultLocation(row: ReceivedRow): string {
  const c = row.patientCity?.trim()
  const s = row.patientState?.trim()
  if (c && s) return `${c}, ${s}`
  return c || s || ''
}

export default function ReceivedList({
  rows,
  platformUrls,
}: {
  rows: ReceivedRow[]
  /** Map of site → write-review URL, so staff can jump to the right
   *  public-review page to copy the patient's quote. Null sites are
   *  not configured by the clinic. */
  platformUrls: Partial<Record<ReviewSite, string | null>>
}) {
  const [active, setActive] = useState<ReceivedRow | null>(null)

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-stone-50/80 dark:bg-stone-900/80 border-b border-stone-200 dark:border-stone-700/60">
          <tr className="text-left text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
            <th className="px-4 py-2.5">Patient</th>
            <th className="px-4 py-2.5">Reviewed on</th>
            <th className="px-4 py-2.5">When</th>
            <th className="px-4 py-2.5 text-right">Website testimonial</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-stone-100 dark:border-stone-700/40 last:border-b-0 hover:bg-stone-50/60 dark:hover:bg-stone-800/30"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/patients/${r.patientId}`}
                  className="font-medium text-stone-800 dark:text-stone-100 hover:underline"
                >
                  {r.patientFirstName} {r.patientLastName}
                </Link>
                {(r.patientCity || r.patientState) && (
                  <p className="text-[11px] text-stone-400 dark:text-stone-500">
                    {defaultLocation(r)}
                  </p>
                )}
              </td>
              <td className="px-4 py-3">
                {r.selectedSite ? (
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded ${PLATFORM_PILL[r.selectedSite]}`}
                  >
                    {PLATFORM_LABEL[r.selectedSite]}
                  </span>
                ) : (
                  <span className="text-[11px] text-stone-400 dark:text-stone-500">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-[12px] text-stone-500 dark:text-stone-400 tabular-nums">
                {fmtRelative(r.completedAtIso)}
              </td>
              <td className="px-4 py-3 text-right">
                {r.isFeatured ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    <span>✓ Featured</span>
                    <button
                      type="button"
                      onClick={() => setActive({ ...r })}
                      className="font-medium text-stone-500 hover:underline"
                    >
                      Edit
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActive(r)}
                    className="text-[12px] font-semibold px-2.5 py-1.5 rounded-md bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
                  >
                    Add to website →
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {active && (
        <CaptureModal
          row={active}
          platformUrls={platformUrls}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  )
}

function CaptureModal({
  row,
  platformUrls,
  onClose,
}: {
  row: ReceivedRow
  platformUrls: Partial<Record<ReviewSite, string | null>>
  onClose: () => void
}) {
  const router = useRouter()
  const [quote, setQuote] = useState('')
  const [authorName, setAuthorName] = useState(defaultAuthorLabel(row))
  const [authorPhotoUrl, setAuthorPhotoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const platformUrl = row.selectedSite ? platformUrls[row.selectedSite] : null

  async function handleUpload(file: File) {
    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) {
      setError('Photo must be 5MB or smaller')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('folder', 'clinic-testimonials')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const body = (await res.json()) as { url?: string }
      if (body.url) setAuthorPhotoUrl(body.url)
    } finally {
      setUploading(false)
    }
  }

  function save() {
    setError(null)
    if (!quote.trim()) {
      setError('Paste the patient’s review text first')
      return
    }
    startTransition(async () => {
      const r = await featureReviewAsTestimonialAction({
        patientId: row.patientId,
        quote: quote.trim(),
        authorNameOverride: authorName !== defaultAuthorLabel(row) ? authorName : null,
        authorPhotoUrl,
      })
      if (r.ok) {
        router.refresh()
        onClose()
      } else {
        setError(r.error)
      }
    })
  }

  function unfeature() {
    setError(null)
    startTransition(async () => {
      const r = await unfeatureReviewTestimonialAction(row.patientId)
      if (r.ok) {
        router.refresh()
        onClose()
      } else {
        setError(r.error)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-stone-900 rounded-2xl shadow-xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Capture {row.patientFirstName}&apos;s review
            </h3>
            <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-1">
              {row.isFeatured
                ? 'Edit or remove this testimonial from your website.'
                : `${row.patientFirstName} left a review${row.selectedSite ? ` on ${PLATFORM_LABEL[row.selectedSite]}` : ''}. Copy the quote from the public platform and paste it below to feature it on your website.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {platformUrl && (
          <a
            href={platformUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium mb-4 text-violet-600 dark:text-violet-400 hover:underline"
          >
            ↗ Open {row.selectedSite ? PLATFORM_LABEL[row.selectedSite] : ''} review page
          </a>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-1.5">
              Review quote
            </label>
            <textarea
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              className="form-textarea w-full text-sm"
              rows={5}
              maxLength={500}
              placeholder={`What did ${row.patientFirstName} say? 2–4 sentences works best.`}
              autoFocus
            />
            <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-1 tabular-nums">
              {quote.length} / 500
            </p>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-1.5">
              Display label
            </label>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="form-input w-full text-sm"
              maxLength={64}
            />
            <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-1">
              Defaults to first name + last initial. Edit only if you have the patient&apos;s permission for a different label.
            </p>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-1.5">
              Photo (optional)
            </label>
            <div className="flex items-center gap-3">
              <label className="inline-block">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleUpload(file)
                    e.target.value = ''
                  }}
                />
                <span className="btn-sm cursor-pointer bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:border-stone-300 text-stone-700 dark:text-stone-200">
                  {uploading ? 'Uploading…' : authorPhotoUrl ? 'Replace photo' : 'Upload photo'}
                </span>
              </label>
              {authorPhotoUrl && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={authorPhotoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setAuthorPhotoUrl(null)}
                    className="text-[12px] text-stone-500 hover:text-stone-700"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>

          {error && (
            <p className="text-[12px] text-rose-600 dark:text-rose-400">{error}</p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t border-stone-100 dark:border-stone-700/60">
          <div>
            {row.isFeatured && (
              <button
                type="button"
                onClick={unfeature}
                disabled={pending}
                className="text-[12px] font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 disabled:opacity-50"
              >
                Remove from website
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-[12px] font-medium text-stone-600 dark:text-stone-300 hover:underline"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending || !quote.trim()}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 disabled:opacity-50"
            >
              {pending ? 'Saving…' : row.isFeatured ? 'Update testimonial' : 'Feature on website'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
