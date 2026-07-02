'use client'

import { useState, useTransition } from 'react'
import { claimOfferAction } from './actions'

/**
 * The one-button claim card. States: pending (Claim this time) → claimed
 * (you're booked ✓) · taken/lost (someone beat you — book online / call) ·
 * expired (the time passed). Warm, anti-shame copy throughout.
 */

const INK = '#1C1A17'
const MUTED = '#6B635A'
const BORDER = '#E8E2D9'

type Status = 'pending' | 'claimed' | 'lost' | 'expired'

export default function ClaimForm({
  token,
  brand,
  clinicName,
  clinicPhone,
  patientFirstName,
  whenLabel,
  visitTypeLabel,
  providerName,
  initialStatus,
  bookUrl,
}: {
  token: string
  brand: string
  clinicName: string
  clinicPhone: string | null
  patientFirstName: string
  whenLabel: string
  visitTypeLabel: string
  providerName: string | null
  initialStatus: Status
  bookUrl: string | null
}) {
  const [status, setStatus] = useState<Status>(initialStatus)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function claim() {
    setError(null)
    startTransition(async () => {
      try {
        const r = await claimOfferAction(token)
        if (r.ok) setStatus('claimed')
        else if (r.reason === 'expired') setStatus('expired')
        else setStatus('lost')
      } catch {
        setError('Something went wrong — please try again, or give us a call.')
      }
    })
  }

  const card = (children: React.ReactNode) => (
    <div
      className="rounded-3xl p-6 sm:p-8 text-center shadow-sm"
      style={{ backgroundColor: '#FFFFFF', border: `1px solid ${BORDER}` }}
    >
      {children}
    </div>
  )

  if (status === 'claimed') {
    return card(
      <>
        <div className="text-4xl mb-3" aria-hidden="true">🎉</div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: INK, fontFamily: 'var(--font-display)' }}>
          You’re booked, {patientFirstName}!
        </h1>
        <p className="text-[0.95rem] leading-relaxed" style={{ color: MUTED }}>
          Your {visitTypeLabel.toLowerCase()} is confirmed for <strong style={{ color: INK }}>{whenLabel}</strong>
          {providerName ? ` with ${providerName}` : ''}. A confirmation email is on its way
          {' '}— and if you had a later visit with us, we’ve moved it for you. See you soon!
        </p>
      </>,
    )
  }

  if (status === 'expired') {
    return card(
      <>
        <h1 className="text-2xl font-bold mb-2" style={{ color: INK, fontFamily: 'var(--font-display)' }}>
          That time has passed
        </h1>
        <p className="text-[0.95rem] leading-relaxed mb-5" style={{ color: MUTED }}>
          This opening has come and gone — but you’re still on our fast-pass list, and we’ll
          reach out the moment another time frees up.
        </p>
        {bookUrl && (
          <a
            href={bookUrl}
            className="inline-block rounded-xl px-5 py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: brand }}
          >
            See open times
          </a>
        )}
      </>,
    )
  }

  if (status === 'lost') {
    return card(
      <>
        <h1 className="text-2xl font-bold mb-2" style={{ color: INK, fontFamily: 'var(--font-display)' }}>
          Someone beat you to it
        </h1>
        <p className="text-[0.95rem] leading-relaxed mb-5" style={{ color: MUTED }}>
          That opening was claimed just before you — it happens fast! You’re still on the
          fast-pass list, so we’ll let you know the next time a slot frees up.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {bookUrl && (
            <a
              href={bookUrl}
              className="inline-block rounded-xl px-5 py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: brand }}
            >
              See other open times
            </a>
          )}
          {clinicPhone && (
            <a
              href={`tel:${clinicPhone}`}
              className="inline-block rounded-xl px-5 py-3 text-sm font-semibold"
              style={{ color: INK, border: `1px solid ${BORDER}` }}
            >
              Call {clinicName}
            </a>
          )}
        </div>
      </>,
    )
  }

  return card(
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-3" style={{ color: brand }}>
        Fast pass · first come, first served
      </p>
      <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: INK, fontFamily: 'var(--font-display)' }}>
        {whenLabel}
      </h1>
      <p className="text-[0.95rem] leading-relaxed mb-6" style={{ color: MUTED }}>
        Hi {patientFirstName} — a {visitTypeLabel.toLowerCase()}
        {providerName ? ` with ${providerName}` : ''} just opened up at {clinicName}. Tap below
        and it’s yours. If you have a later visit with us, we’ll move it automatically — no
        phone call needed.
      </p>
      <button
        type="button"
        onClick={claim}
        disabled={pending}
        className="w-full sm:w-auto rounded-xl px-8 py-3.5 text-base font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: brand }}
      >
        {pending ? 'Claiming…' : 'Claim this time'}
      </button>
      {error && (
        <p className="mt-3 text-sm" style={{ color: '#B4231F' }} role="alert">
          {error}
        </p>
      )}
      <p className="mt-4 text-xs" style={{ color: MUTED }}>
        Time doesn’t work? Just ignore this — your spot on the list is safe.
      </p>
    </>,
  )
}
