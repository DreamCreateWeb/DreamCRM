'use client'

import { useState, useTransition } from 'react'
import { pickPlatformAction, submitReviewAction } from './actions'

type ReviewSite = 'google' | 'healthgrades' | 'facebook' | 'yelp'

const PLATFORM_LABEL: Record<ReviewSite, string> = {
  google: 'Google',
  healthgrades: 'Healthgrades',
  facebook: 'Facebook',
  yelp: 'Yelp',
}

const PLATFORM_BLURB: Record<ReviewSite, string> = {
  google: 'Most people find your dentist this way — sharing here helps the most.',
  healthgrades: 'The dental-specific platform — especially helpful for healthcare reputation.',
  facebook: 'Useful if you found them via Facebook or have an account.',
  yelp: 'Useful if you already write reviews on Yelp.',
}

export default function ReviewForm({
  token,
  clinicName,
  patientFirstName,
  alreadyCompleted,
  existingReviewText,
  existingRating,
  sites,
}: {
  token: string
  clinicName: string
  patientFirstName: string
  alreadyCompleted: boolean
  existingReviewText: string | null
  existingRating: number | null
  sites: ReviewSite[]
}) {
  // After-submit flips the page into "thanks + share elsewhere?" mode
  // without a navigation; the server action revalidates so the next read
  // shows the existing text back to the patient.
  const justSubmittedInitial = alreadyCompleted && !!existingReviewText
  const [text, setText] = useState(existingReviewText ?? '')
  const [rating, setRating] = useState<number | null>(existingRating ?? null)
  const [submitted, setSubmitted] = useState(justSubmittedInitial)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData()
    fd.set('reviewText', text)
    if (rating != null) fd.set('rating', String(rating))
    startTransition(async () => {
      const r = await submitReviewAction(token, fd)
      if (r.ok) setSubmitted(true)
      else setError(r.error)
    })
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 mb-2">
          {clinicName}
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight mb-3">
          Thank you, {escapeText(patientFirstName)}.
        </h1>
        <p className="text-[15px] text-stone-700 leading-relaxed mb-6">
          Your review is in — {clinicName} can read it from their dashboard. It
          means a lot.
        </p>

        <blockquote className="bg-stone-50 rounded-xl p-4 border-l-2 border-stone-300 mb-6 text-[15px] leading-relaxed text-stone-800 italic whitespace-pre-wrap">
          &ldquo;{text}&rdquo;
        </blockquote>

        {sites.length > 0 && (
          <>
            <p className="text-sm font-semibold text-stone-900 mb-3">
              Also share your review publicly?
            </p>
            <p className="text-[13px] text-stone-600 mb-4">
              Honest reviews on the platforms below help other people find
              {' '}{clinicName}. Totally optional — your review&apos;s already in.
            </p>
            <div className="space-y-2.5">
              {sites.map((site) => (
                <form key={site} action={pickPlatformAction.bind(null, token, site)}>
                  <button
                    type="submit"
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 rounded-xl border-2 border-stone-200 hover:border-stone-900 hover:bg-stone-50 transition text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-stone-900">
                        Share on {PLATFORM_LABEL[site]}
                      </p>
                      <p className="text-[11px] text-stone-500 mt-0.5">
                        {PLATFORM_BLURB[site]}
                      </p>
                    </div>
                    <span className="text-stone-400 text-xl shrink-0">→</span>
                  </button>
                </form>
              ))}
            </div>
          </>
        )}

        <div className="mt-8 pt-6 border-t border-stone-100 text-center">
          <p className="text-[11px] text-stone-400">
            You can close this page now — your review is saved.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 md:p-10">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 mb-2">
        {clinicName}
      </p>
      <h1 className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight mb-3">
        Thanks for coming in, {escapeText(patientFirstName)}.
      </h1>
      <p className="text-[15px] text-stone-700 leading-relaxed mb-6">
        Would you take a minute to share how your visit went? Honest, good or
        bad — your words help other patients decide.
      </p>

      <div className="mb-5">
        <label className="block text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-2">
          How was your visit? (optional)
        </label>
        <RatingSelector value={rating} onChange={setRating} />
      </div>

      <div className="mb-5">
        <label htmlFor="review-text" className="block text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-2">
          Your review
        </label>
        <textarea
          id="review-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          maxLength={2000}
          className="w-full text-[15px] leading-relaxed px-4 py-3 rounded-xl border border-stone-200 focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-100 resize-none"
          placeholder="What stood out? 2-4 sentences works best."
          required
        />
        <p className="text-[11px] text-stone-400 mt-1 tabular-nums text-right">
          {text.length} / 2000
        </p>
      </div>

      {error && (
        <p className="text-[13px] text-rose-600 mb-3">{error}</p>
      )}

      <button
        type="submit"
        disabled={pending || !text.trim()}
        className="w-full inline-flex items-center justify-center px-5 py-3.5 rounded-full text-sm font-semibold text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? 'Submitting…' : 'Submit my review'}
      </button>

      <p className="text-[11px] text-stone-400 mt-4 text-center">
        You can also share publicly on Google, Healthgrades, etc — we&apos;ll
        offer those after you submit.
      </p>
    </form>
  )
}

function RatingSelector({
  value,
  onChange,
}: {
  value: number | null
  onChange: (n: number | null) => void
}) {
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          aria-label={`${n} out of 5 stars`}
          aria-pressed={value != null && n <= value}
          className={`text-2xl leading-none transition ${
            value != null && n <= value ? 'text-amber-500' : 'text-stone-300 hover:text-amber-400'
          }`}
        >
          ★
        </button>
      ))}
      {value != null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-2 text-[11px] text-stone-400 hover:text-stone-600 underline"
        >
          Clear
        </button>
      )}
    </div>
  )
}

function escapeText(s: string): string {
  // React already escapes HTML in {} interpolation; this just prevents the
  // odd case of a name with whitespace-only / null-byte content slipping
  // through to the visible greeting.
  return s.trim() || 'there'
}
