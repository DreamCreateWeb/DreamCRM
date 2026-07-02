'use client'

import { useState, useTransition } from 'react'
import { startBalanceCheckoutAction } from './actions'

/**
 * The pay card. States: due (amount + Pay button → Stripe) · clear (balance
 * is zero — nothing owed) · just-paid receipt (return trip). Warm, anti-shame
 * copy — owing a dental balance is loaded; we never guilt-trip.
 */

const INK = '#1C1A17'
const MUTED = '#6B635A'
const BORDER = '#E8E2D9'

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default function PayForm({
  token,
  brand,
  clinicName,
  clinicPhone,
  patientFirstName,
  balanceCents,
  balanceUpdatedAtIso,
  canPay,
  justPaidCents,
}: {
  token: string
  brand: string
  clinicName: string
  clinicPhone: string | null
  patientFirstName: string
  balanceCents: number
  balanceUpdatedAtIso: string | null
  canPay: boolean
  justPaidCents: number | null
}) {
  const [amount, setAmount] = useState(() => (balanceCents / 100).toFixed(2))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const card = (children: React.ReactNode) => (
    <div
      className="rounded-3xl p-6 sm:p-8 text-center shadow-sm"
      style={{ backgroundColor: '#FFFFFF', border: `1px solid ${BORDER}` }}
    >
      {children}
    </div>
  )

  const callLine = clinicPhone && (
    <p className="mt-4 text-xs" style={{ color: MUTED }}>
      Question about the amount? Call us at{' '}
      <a href={`tel:${clinicPhone}`} className="font-semibold" style={{ color: INK }}>
        {clinicPhone}
      </a>{' '}
      — happy to walk through it.
    </p>
  )

  if (justPaidCents) {
    return card(
      <>
        <div className="text-4xl mb-3" aria-hidden="true">🎉</div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: INK, fontFamily: 'var(--font-display)' }}>
          Payment received — thank you, {patientFirstName}!
        </h1>
        <p className="text-[0.95rem] leading-relaxed" style={{ color: MUTED }}>
          Your {fmt(justPaidCents)} payment to {clinicName} went through. A receipt from our
          payment processor is on its way to your email.
          {balanceCents > 0
            ? ' Anything remaining will show the next time your account refreshes.'
            : ''}
        </p>
      </>,
    )
  }

  if (balanceCents <= 0) {
    return card(
      <>
        <div className="text-4xl mb-3" aria-hidden="true">✨</div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: INK, fontFamily: 'var(--font-display)' }}>
          You&rsquo;re all clear, {patientFirstName}
        </h1>
        <p className="text-[0.95rem] leading-relaxed" style={{ color: MUTED }}>
          Our records show no balance on your account with {clinicName} right now — nothing to
          do here. Thanks for being on top of it!
        </p>
        {callLine}
      </>,
    )
  }

  if (!canPay) {
    return card(
      <>
        <h1 className="text-2xl font-bold mb-2" style={{ color: INK, fontFamily: 'var(--font-display)' }}>
          Online payment is taking a breather
        </h1>
        <p className="text-[0.95rem] leading-relaxed mb-2" style={{ color: MUTED }}>
          Your balance with {clinicName} is <strong style={{ color: INK }}>{fmt(balanceCents)}</strong>,
          but online payment isn&rsquo;t available right this moment.
        </p>
        {clinicPhone ? (
          <a
            href={`tel:${clinicPhone}`}
            className="inline-block mt-3 rounded-xl px-5 py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: brand }}
          >
            Call {clinicName}
          </a>
        ) : (
          <p className="text-sm" style={{ color: MUTED }}>Give us a call and we&rsquo;ll take it over the phone.</p>
        )}
      </>,
    )
  }

  function pay() {
    setError(null)
    const cents = Math.round(Number(amount) * 100)
    if (!Number.isFinite(cents) || cents < 100) {
      setError('Enter an amount of at least $1.')
      return
    }
    if (cents > balanceCents) {
      setError(`That’s more than your current balance — pay up to ${fmt(balanceCents)}.`)
      return
    }
    startTransition(async () => {
      try {
        const r = await startBalanceCheckoutAction(token, cents)
        if (r.ok) window.location.assign(r.url)
        else setError(r.error)
      } catch {
        setError('Something went wrong — please try again, or give us a call.')
      }
    })
  }

  const asOf = balanceUpdatedAtIso
    ? new Date(balanceUpdatedAtIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return card(
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-3" style={{ color: brand }}>
        Secure payment · about a minute
      </p>
      <h1 className="text-3xl sm:text-4xl font-bold mb-1" style={{ color: INK, fontFamily: 'var(--font-display)' }}>
        {fmt(balanceCents)}
      </h1>
      <p className="text-[0.95rem] leading-relaxed mb-6" style={{ color: MUTED }}>
        Hi {patientFirstName} — this is your current balance with {clinicName}
        {asOf ? ` (as of ${asOf})` : ''}. No rush and no judgment — pay all of it or part of it,
        whatever works today.
      </p>
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className="text-lg font-semibold" style={{ color: INK }}>$</span>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Amount to pay in dollars"
          className="w-36 rounded-xl px-4 py-3 text-center text-lg font-semibold tabular-nums"
          style={{ color: INK, border: `1px solid ${BORDER}` }}
        />
      </div>
      <button
        type="button"
        onClick={pay}
        disabled={pending}
        className="w-full sm:w-auto rounded-xl px-8 py-3.5 text-base font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: brand }}
      >
        {pending ? 'Opening secure checkout…' : 'Pay securely'}
      </button>
      {error && (
        <p className="mt-3 text-sm" style={{ color: '#B4231F' }} role="alert">
          {error}
        </p>
      )}
      {callLine}
    </>,
  )
}
