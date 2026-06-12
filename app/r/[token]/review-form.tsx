'use client'

import { useRef, useState, useTransition } from 'react'
import { CLINIC_THEME, readableInk } from '@/lib/clinic-site-theme'
import { HONEYPOT_FIELD, TIMETRAP_FIELD } from '@/lib/form-trust'
import FormTrustFields from '@/components/clinic-site/form-trust-fields'
import { pickPlatformAction, submitReviewAction } from './actions'

const { INK, INK_MUTED, SURFACE, BORDER } = CLINIC_THEME

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
  brand,
  patientFirstName,
  alreadyCompleted,
  existingReviewText,
  existingRating,
  sites,
}: {
  token: string
  clinicName: string
  brand: string
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
  const formRef = useRef<HTMLFormElement>(null)

  const ink = readableInk(brand)
  const display = { fontFamily: 'var(--font-display, Georgia, serif)' }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData()
    fd.set('reviewText', text)
    if (rating != null) fd.set('rating', String(rating))
    // The form builds FormData by hand (reviewText comes from state), so pull
    // the spam-trust hidden values off the rendered inputs and carry them.
    const el = formRef.current
    if (el) {
      const hp = el.querySelector<HTMLInputElement>(`[name="${HONEYPOT_FIELD}"]`)
      const ts = el.querySelector<HTMLInputElement>(`[name="${TIMETRAP_FIELD}"]`)
      if (hp) fd.set(HONEYPOT_FIELD, hp.value)
      if (ts) fd.set(TIMETRAP_FIELD, ts.value)
    }
    startTransition(async () => {
      const r = await submitReviewAction(token, fd)
      if (r.ok) setSubmitted(true)
      else setError(r.error)
    })
  }

  if (submitted) {
    return (
      <div
        className="rounded-3xl p-8 md:p-10 shadow-sm"
        style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-2" style={{ color: INK_MUTED }}>
          {clinicName}
        </p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3" style={{ color: ink, ...display }}>
          Thank you, {escapeText(patientFirstName)}.
        </h1>
        <p className="text-[15px] leading-relaxed mb-6" style={{ color: INK_MUTED }}>
          Your review is in — {clinicName} can read it from their dashboard. It
          means a lot.
        </p>

        <blockquote
          className="rounded-xl p-4 mb-6 text-[15px] leading-relaxed italic whitespace-pre-wrap"
          style={{ backgroundColor: `${brand}0D`, borderLeft: `3px solid ${brand}`, color: INK }}
        >
          &ldquo;{text}&rdquo;
        </blockquote>

        {sites.length > 0 && (
          <>
            <p className="text-sm font-semibold mb-3" style={{ color: INK }}>
              Also share your review publicly?
            </p>
            <p className="text-[13px] mb-4" style={{ color: INK_MUTED }}>
              Honest reviews on the platforms below help other people find
              {' '}{clinicName}. Totally optional — your review&apos;s already in.
            </p>
            <div className="space-y-2.5">
              {sites.map((site) => (
                <form key={site} action={pickPlatformAction.bind(null, token, site)}>
                  <button
                    type="submit"
                    className="w-full flex items-center justify-between gap-3 px-5 py-4 rounded-xl border-2 transition text-left hover:bg-black/[0.02]"
                    style={{ borderColor: BORDER }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold" style={{ color: INK }}>
                        Share on {PLATFORM_LABEL[site]}
                      </p>
                      <p className="text-[12px] mt-0.5" style={{ color: INK_MUTED }}>
                        {PLATFORM_BLURB[site]}
                      </p>
                    </div>
                    <span className="text-xl shrink-0" style={{ color: brand }}>→</span>
                  </button>
                </form>
              ))}
            </div>
          </>
        )}

        <div className="mt-8 pt-6 text-center" style={{ borderTop: `1px solid ${BORDER}` }}>
          <p className="text-[12px]" style={{ color: INK_MUTED }}>
            You can close this page now — your review is saved.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="rounded-3xl p-8 md:p-10 shadow-sm"
      style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
    >
      <FormTrustFields />
      <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-2" style={{ color: INK_MUTED }}>
        {clinicName}
      </p>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3" style={{ color: ink, ...display }}>
        Thanks for coming in, {escapeText(patientFirstName)}.
      </h1>
      <p className="text-[15px] leading-relaxed mb-6" style={{ color: INK_MUTED }}>
        Would you take a minute to share how your visit went? Honest, good or
        bad — your words help other patients decide.
      </p>

      <div className="mb-5">
        <label className="block text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: INK_MUTED }}>
          How was your visit? (optional)
        </label>
        <RatingSelector value={rating} onChange={setRating} />
      </div>

      <div className="mb-5">
        <label htmlFor="review-text" className="block text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: INK_MUTED }}>
          Your review
        </label>
        <textarea
          id="review-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          maxLength={2000}
          className="w-full text-[15px] leading-relaxed px-4 py-3 rounded-xl focus:outline-none focus:ring-2 resize-none"
          style={{ border: `1px solid ${BORDER}`, color: INK, ['--tw-ring-color' as string]: `${brand}55` }}
          placeholder="What stood out? 2-4 sentences works best."
          required
        />
        <p className="text-[11px] mt-1 tabular-nums text-right" style={{ color: INK_MUTED }}>
          {text.length} / 2000
        </p>
      </div>

      {error && <p className="text-[13px] text-rose-600 mb-3">{error}</p>}

      <button
        type="submit"
        disabled={pending || !text.trim()}
        className="w-full inline-flex items-center justify-center px-5 py-3.5 rounded-full text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition hover:opacity-95"
        style={{ backgroundColor: brand }}
      >
        {pending ? 'Submitting…' : 'Submit my review'}
      </button>

      <p className="text-[12px] mt-4 text-center" style={{ color: INK_MUTED }}>
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
          className="ml-2 text-[11px] underline"
          style={{ color: INK_MUTED }}
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
