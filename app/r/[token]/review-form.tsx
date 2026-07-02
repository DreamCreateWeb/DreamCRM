'use client'

import { useRef, useState, useTransition } from 'react'
import { readableInk } from '@/lib/clinic-site-theme'
import { HONEYPOT_FIELD, TIMETRAP_FIELD } from '@/lib/form-trust'
import FormTrustFields from '@/components/clinic-site/form-trust-fields'
import { pickPlatformAction, recordGateRatingAction, submitPrivateFeedbackAction } from './actions'

const INK = 'var(--c-ink, #1C1A17)'
const INK_MUTED = 'var(--c-ink-muted, #6B635A)'
const SURFACE = 'var(--c-surface, #FFFFFF)'
const BORDER = 'var(--c-border, #E8E2D9)'

type ReviewSite = 'google' | 'healthgrades' | 'facebook' | 'yelp'

const PLATFORM_LABEL: Record<ReviewSite, string> = {
  google: 'Google',
  healthgrades: 'Healthgrades',
  facebook: 'Facebook',
  yelp: 'Yelp',
}

/**
 * Public review landing (Google-first). The hero action sends the patient
 * straight to Google to write their review; any other configured platforms show
 * as secondary options. An OPTIONAL "rather tell us privately?" path routes
 * feedback to the office (never public) — shown to every patient equally, so it
 * stays FTC-clean. The clinic can hide the private path.
 *
 * STAR GATE (opt-in, `starGateEnabled`): asks "How was your visit?" first.
 * FTC-clean by construction — every rating sees the SAME public platform
 * links; a 1–3★ answer just LEADS with the private-feedback form (public
 * links right below, never hidden), so unhappy patients reach a human
 * faster without any review suppression.
 */
export default function ReviewForm({
  token,
  clinicName,
  brand,
  patientFirstName,
  alreadyCompleted,
  googleUrl,
  sites,
  showPrivateFeedback,
  starGate,
  existingPrivateFeedback,
  existingReviewText,
}: {
  token: string
  clinicName: string
  brand: string
  patientFirstName: string
  alreadyCompleted: boolean
  googleUrl: string | null
  sites: ReviewSite[]
  showPrivateFeedback: boolean
  starGate: boolean
  existingPrivateFeedback: string | null
  existingReviewText: string | null
}) {
  // Non-Google configured platforms (Google is the hero button on its own).
  const otherSites = sites.filter((s) => s !== 'google')
  const noPublic = !googleUrl && otherSites.length === 0

  const [privateSent, setPrivateSent] = useState(false)
  // Open the private form by default only when there's no public platform to send
  // to (and the clinic allows private feedback) — otherwise it's a quiet opt-in.
  const [showPrivate, setShowPrivate] = useState(noPublic && showPrivateFeedback)
  const [text, setText] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  // Star-gate answer (null = not asked / not answered yet).
  const [gateRating, setGateRating] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const ink = readableInk(brand)
  const display = { fontFamily: 'var(--font-display, Georgia, serif)' }

  // A 1–3★ gate answer LEADS with the private form; public links stay below.
  const lowGate = starGate && gateRating != null && gateRating <= 3 && showPrivateFeedback

  function pickGateRating(n: number) {
    setGateRating(n)
    setRating(n) // pre-fill the private form's optional rating
    if (n <= 3 && showPrivateFeedback) setShowPrivate(true)
    // Fire-and-forget — the record is analytics, never a blocker.
    startTransition(async () => {
      try {
        await recordGateRatingAction(token, n)
      } catch {
        /* never block the patient on funnel bookkeeping */
      }
    })
  }

  // ── Completed / just-sent state ──
  if (alreadyCompleted || privateSent) {
    const note = existingPrivateFeedback ?? (privateSent ? text.trim() : null)
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
        {note ? (
          <>
            <p className="text-[15px] leading-relaxed mb-6" style={{ color: INK_MUTED }}>
              Thanks for the honest note — it goes straight to the {clinicName} team, and
              they&apos;ll follow up if it&apos;s something they can make right.
            </p>
            <blockquote
              className="rounded-xl p-4 mb-2 text-[15px] leading-relaxed italic whitespace-pre-wrap"
              style={{ backgroundColor: `${brand}0D`, borderLeft: `3px solid ${brand}`, color: INK }}
            >
              &ldquo;{note}&rdquo;
            </blockquote>
          </>
        ) : existingReviewText ? (
          <>
            <p className="text-[15px] leading-relaxed mb-6" style={{ color: INK_MUTED }}>
              Your review is in — thank you. It means a lot to {clinicName}.
            </p>
            <blockquote
              className="rounded-xl p-4 mb-2 text-[15px] leading-relaxed italic whitespace-pre-wrap"
              style={{ backgroundColor: `${brand}0D`, borderLeft: `3px solid ${brand}`, color: INK }}
            >
              &ldquo;{existingReviewText}&rdquo;
            </blockquote>
          </>
        ) : (
          <>
            <p className="text-[15px] leading-relaxed mb-6" style={{ color: INK_MUTED }}>
              You&apos;re all set — thanks for taking the time. It means a lot to {clinicName}.
            </p>
            {googleUrl && (
              <form action={pickPlatformAction.bind(null, token, 'google')}>
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-full text-sm font-semibold text-white transition hover:opacity-95"
                  style={{ backgroundColor: brand }}
                >
                  Leave a Google review →
                </button>
              </form>
            )}
          </>
        )}
        <div className="mt-8 pt-6 text-center" style={{ borderTop: `1px solid ${BORDER}` }}>
          <p className="text-[12px]" style={{ color: INK_MUTED }}>You can close this page now.</p>
        </div>
      </div>
    )
  }

  function submitPrivate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData()
    fd.set('feedbackText', text)
    if (rating != null) fd.set('rating', String(rating))
    // The form builds FormData by hand, so carry the spam-trust hidden values.
    const el = formRef.current
    if (el) {
      const hp = el.querySelector<HTMLInputElement>(`[name="${HONEYPOT_FIELD}"]`)
      const ts = el.querySelector<HTMLInputElement>(`[name="${TIMETRAP_FIELD}"]`)
      if (hp) fd.set(HONEYPOT_FIELD, hp.value)
      if (ts) fd.set(TIMETRAP_FIELD, ts.value)
    }
    startTransition(async () => {
      const r = await submitPrivateFeedbackAction(token, fd)
      if (r.ok) setPrivateSent(true)
      else setError(r.error)
    })
  }

  // ── Star-gate ask (opt-in): "How was your visit?" comes first ──
  if (starGate && gateRating === null) {
    return (
      <div
        className="rounded-3xl p-8 md:p-10 shadow-sm text-center"
        style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-2" style={{ color: INK_MUTED }}>
          {clinicName}
        </p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3" style={{ color: ink, ...display }}>
          Thanks for coming in, {escapeText(patientFirstName)}.
        </h1>
        <p className="text-[15px] leading-relaxed mb-6" style={{ color: INK_MUTED }}>
          How was your visit? Just tap a star — it takes two seconds.
        </p>
        <div className="inline-flex items-center gap-2" role="group" aria-label="How was your visit?">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => pickGateRating(n)}
              aria-label={`${n} out of 5 stars`}
              className="text-4xl leading-none text-stone-300 hover:text-amber-400 transition"
            >
              ★
            </button>
          ))}
        </div>
      </div>
    )
  }

  const publicBlock = (
    <>
      {/* PRIMARY — Google */}
      {googleUrl && (
        <form action={pickPlatformAction.bind(null, token, 'google')}>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-4 rounded-full text-base font-semibold text-white transition hover:opacity-95"
            style={lowGate ? { backgroundColor: SURFACE, color: INK, border: `2px solid ${BORDER}` } : { backgroundColor: brand }}
          >
            <GoogleGlyph /> Review us on Google →
          </button>
        </form>
      )}

      {/* Other configured platforms (secondary) */}
      {otherSites.length > 0 && (
        <div className={`space-y-2.5 ${googleUrl ? 'mt-3' : ''}`}>
          {otherSites.map((site) => (
            <form key={site} action={pickPlatformAction.bind(null, token, site)}>
              <button
                type="submit"
                className="w-full flex items-center justify-between gap-3 px-5 py-3.5 rounded-xl border-2 transition text-left hover:bg-black/[0.02]"
                style={{ borderColor: BORDER }}
              >
                <span className="text-sm font-bold" style={{ color: INK }}>
                  Review us on {PLATFORM_LABEL[site]}
                </span>
                <span className="text-lg shrink-0" style={{ color: brand }}>→</span>
              </button>
            </form>
          ))}
        </div>
      )}
    </>
  )

  const privateBlock = showPrivateFeedback && (
    <div
      className={noPublic || lowGate ? '' : 'mt-6 pt-6'}
      style={noPublic || lowGate ? undefined : { borderTop: `1px solid ${BORDER}` }}
    >
      {!showPrivate ? (
        <button
          type="button"
          onClick={() => setShowPrivate(true)}
          className="text-[13px] underline"
          style={{ color: INK_MUTED }}
        >
          Rather share your feedback privately with the team? →
        </button>
      ) : (
        <form ref={formRef} onSubmit={submitPrivate}>
          <FormTrustFields />
          {!noPublic && !lowGate && (
            <p className="text-[13px] mb-3" style={{ color: INK_MUTED }}>
              This goes straight to the {clinicName} team — it won&apos;t be posted publicly.
            </p>
          )}
          <div className="mb-4">
            <label className="block text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: INK_MUTED }}>
              How was your visit? (optional)
            </label>
            <RatingSelector value={rating} onChange={setRating} />
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={2000}
            className="w-full text-[15px] leading-relaxed px-4 py-3 rounded-xl focus:outline-none focus:ring-2 resize-none"
            style={{ border: `1px solid ${BORDER}`, color: INK, ['--tw-ring-color' as string]: `${brand}55` }}
            placeholder="Tell us what we could do better — we read every note."
            required
          />
          {error && <p className="text-[13px] text-rose-600 mt-2">{error}</p>}
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="mt-3 w-full inline-flex items-center justify-center px-5 py-3 rounded-full text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition hover:opacity-95"
            style={{ backgroundColor: brand }}
          >
            {pending ? 'Sending…' : 'Send to the team'}
          </button>
        </form>
      )}
    </div>
  )

  return (
    <div
      className="rounded-3xl p-8 md:p-10 shadow-sm"
      style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] mb-2" style={{ color: INK_MUTED }}>
        {clinicName}
      </p>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-3" style={{ color: ink, ...display }}>
        {lowGate ? `Thanks for the honesty, ${escapeText(patientFirstName)}.` : `Thanks for coming in, ${escapeText(patientFirstName)}.`}
      </h1>
      <p className="text-[15px] leading-relaxed mb-6" style={{ color: INK_MUTED }}>
        {lowGate
          ? `Tell us what happened — your note goes straight to the ${clinicName} team (never public), and they'll work to make it right.`
          : googleUrl
            ? `Would you share how your visit went on Google? It takes a minute — and it's the #1 way new patients find ${clinicName}.`
            : otherSites.length > 0
              ? `Would you share how your visit went? It takes a minute and helps other patients find ${clinicName}.`
              : `We'd love to hear how your visit went.`}
      </p>

      {/* FTC-clean ordering: every rating sees the SAME public links. A low
          gate answer merely LEADS with the private form — the public path
          stays right below, never hidden. */}
      {lowGate ? (
        <>
          {privateBlock}
          {!noPublic && (
            <div className="mt-6 pt-6" style={{ borderTop: `1px solid ${BORDER}` }}>
              <p className="text-[13px] mb-3" style={{ color: INK_MUTED }}>
                Prefer to share your experience publicly? That&apos;s always welcome too.
              </p>
              {publicBlock}
            </div>
          )}
        </>
      ) : (
        <>
          {publicBlock}
          {privateBlock}
        </>
      )}
    </div>
  )
}

function GoogleGlyph() {
  // Simple "G" mark in a white chip — decorative.
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-[13px] font-bold"
      style={{ color: '#4285F4' }}
    >
      G
    </span>
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
  return s.trim() || 'there'
}
