'use client'

import { useState, useTransition } from 'react'
import { confirmVisitAction } from './actions'

/**
 * The one-button confirm card. States: pending (Confirm my visit) → confirmed
 * (see you then ✓) · cancelled (this visit was cancelled — rebook) · past
 * (this visit already happened). Warm, anti-shame copy throughout.
 */

const INK = '#1C1A17'
const MUTED = '#6B635A'
const BORDER = '#E8E2D9'

type State = 'pending' | 'confirmed' | 'cancelled' | 'past'

export default function ConfirmForm({
  token,
  brand,
  clinicName,
  clinicPhone,
  patientFirstName,
  whenLabel,
  visitTypeLabel,
  providerName,
  prepInstructions,
  initialState,
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
  prepInstructions: string
  initialState: State
  bookUrl: string | null
}) {
  const [state, setState] = useState<State>(initialState)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function confirm() {
    setError(null)
    startTransition(async () => {
      try {
        const r = await confirmVisitAction(token)
        setState(r.state)
        if (!r.ok && r.state === 'pending') {
          setError('Something went wrong — please try again, or give us a call.')
        }
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

  const prepBlock = prepInstructions ? (
    <div
      className="mt-5 rounded-2xl p-4 text-left text-sm leading-relaxed"
      style={{ backgroundColor: '#FAF7F2', border: `1px solid ${BORDER}`, color: MUTED }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: brand }}>
        Before your visit
      </p>
      {prepInstructions}
    </div>
  ) : null

  if (state === 'confirmed') {
    return card(
      <>
        <div className="text-4xl mb-3" aria-hidden="true">✅</div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: INK, fontFamily: 'var(--font-display)' }}>
          You&rsquo;re confirmed, {patientFirstName}!
        </h1>
        <p className="text-[0.95rem] leading-relaxed" style={{ color: MUTED }}>
          Your {visitTypeLabel.toLowerCase()}
          {providerName ? ` with ${providerName}` : ''} is locked in for{' '}
          <strong style={{ color: INK }}>{whenLabel}</strong>. See you then!
        </p>
        {prepBlock}
      </>,
    )
  }

  if (state === 'cancelled') {
    return card(
      <>
        <h1 className="text-2xl font-bold mb-2" style={{ color: INK, fontFamily: 'var(--font-display)' }}>
          This visit was cancelled
        </h1>
        <p className="text-[0.95rem] leading-relaxed mb-5" style={{ color: MUTED }}>
          It looks like this appointment isn&rsquo;t on the books anymore. If that&rsquo;s a
          surprise, we&rsquo;re happy to get you back on the schedule.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {bookUrl && (
            <a
              href={bookUrl}
              className="inline-block rounded-xl px-5 py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: brand }}
            >
              Book a new time
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

  if (state === 'past') {
    return card(
      <>
        <h1 className="text-2xl font-bold mb-2" style={{ color: INK, fontFamily: 'var(--font-display)' }}>
          This visit already happened
        </h1>
        <p className="text-[0.95rem] leading-relaxed mb-5" style={{ color: MUTED }}>
          This confirmation link was for {whenLabel} — which has come and gone. Need to
          come back in? We&rsquo;d love to see you.
        </p>
        {bookUrl && (
          <a
            href={bookUrl}
            className="inline-block rounded-xl px-5 py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: brand }}
          >
            Book a visit
          </a>
        )}
      </>,
    )
  }

  return card(
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-3" style={{ color: brand }}>
        One tap and you&rsquo;re set
      </p>
      <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: INK, fontFamily: 'var(--font-display)' }}>
        {whenLabel}
      </h1>
      <p className="text-[0.95rem] leading-relaxed mb-6" style={{ color: MUTED }}>
        Hi {patientFirstName} — your {visitTypeLabel.toLowerCase()}
        {providerName ? ` with ${providerName}` : ''} at {clinicName} is coming up. Tap below to
        let us know you&rsquo;ll be there.
      </p>
      <button
        type="button"
        onClick={confirm}
        disabled={pending}
        className="w-full sm:w-auto rounded-xl px-8 py-3.5 text-base font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: brand }}
      >
        {pending ? 'Confirming…' : 'Confirm my visit'}
      </button>
      {error && (
        <p className="mt-3 text-sm" style={{ color: '#B4231F' }} role="alert">
          {error}
        </p>
      )}
      {prepBlock}
      <p className="mt-4 text-xs" style={{ color: MUTED }}>
        Time doesn&rsquo;t work anymore?{' '}
        {clinicPhone ? (
          <>
            Call us at{' '}
            <a href={`tel:${clinicPhone}`} className="font-semibold" style={{ color: INK }}>
              {clinicPhone}
            </a>{' '}
            and we&rsquo;ll find a better one.
          </>
        ) : (
          'Reply to the email and we’ll find a better one.'
        )}
      </p>
    </>,
  )
}
