'use client'

import { useState } from 'react'
import { startPlanSetupAction } from './actions'

/**
 * The payment-plan acceptance card. 'proposed' shows the terms + the accept
 * button (→ Stripe setup Checkout; nothing charges until they accept);
 * active/past_due/completed/canceled show a status view — the link keeps
 * working as a "where's my plan" page for the plan's whole life.
 */
export default function PlanForm({
  token,
  brand,
  clinicName,
  clinicPhone,
  patientFirstName,
  state,
  totalCents,
  installments,
  installmentCents,
  lastInstallmentCents,
  installmentsPaid,
  nextChargeAtIso,
  canPay,
  justAccepted,
}: {
  token: string
  brand: string
  clinicName: string
  clinicPhone: string | null
  patientFirstName: string
  state: 'proposed' | 'active' | 'past_due' | 'completed' | 'canceled'
  totalCents: number
  installments: number
  installmentCents: number
  lastInstallmentCents: number
  installmentsPaid: number
  nextChargeAtIso: string | null
  canPay: boolean
  justAccepted: boolean
}) {
  const [status, setStatus] = useState<'idle' | 'redirecting' | 'error'>('idle')
  const [error, setError] = useState('')

  const money = (c: number) => `$${(c / 100).toFixed(2)}`
  const perLine =
    lastInstallmentCents === installmentCents
      ? `${installments} monthly payments of ${money(installmentCents)}`
      : `${installments} monthly payments — ${money(installmentCents)}/month, last one ${money(lastInstallmentCents)}`

  async function accept() {
    setStatus('redirecting')
    setError('')
    const r = await startPlanSetupAction(token)
    if (r.ok) {
      window.location.assign(r.url)
      return
    }
    setError(r.error)
    setStatus('error')
  }

  const card = (children: React.ReactNode) => (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">{children}</div>
  )

  if (state === 'canceled') {
    return card(
      <>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
          This plan was canceled
        </h1>
        <p className="mt-2 text-[0.95rem] text-gray-600">
          No payments will be charged. If that’s a surprise, give {clinicName} a call
          {clinicPhone ? ` at ${clinicPhone}` : ''} and they’ll sort it out.
        </p>
      </>,
    )
  }

  if (state === 'completed') {
    return card(
      <>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
          All paid — thank you, {patientFirstName} 🎉
        </h1>
        <p className="mt-2 text-[0.95rem] text-gray-600">
          Your {money(totalCents)} plan with {clinicName} is complete. Nothing more will be charged.
        </p>
      </>,
    )
  }

  if (state === 'active' || state === 'past_due') {
    const next = nextChargeAtIso
      ? new Date(nextChargeAtIso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
      : null
    return card(
      <>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
          {justAccepted ? `You’re all set, ${patientFirstName}` : 'Your payment plan'}
        </h1>
        <p className="mt-2 text-[0.95rem] text-gray-600">
          {money(totalCents)} with {clinicName} — {perLine}, charged automatically to your saved card.
        </p>
        <div className="mt-5 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-[0.92rem] text-gray-700">
          <p>
            <strong>{installmentsPaid}</strong> of <strong>{installments}</strong> payments made
            {next ? <> · next one {next}</> : null}
          </p>
        </div>
        {state === 'past_due' && (
          <p className="mt-4 text-[0.9rem] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            The last charge didn’t go through — we’ll retry automatically. If your card changed,
            call {clinicName}{clinicPhone ? ` at ${clinicPhone}` : ''} and they’ll update it.
          </p>
        )}
      </>,
    )
  }

  // proposed
  return card(
    <>
      <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
        Hi {patientFirstName} — spread it out, no stress
      </h1>
      <p className="mt-2 text-[0.95rem] text-gray-600">
        {clinicName} set up a payment plan for your <strong>{money(totalCents)}</strong> balance:
      </p>
      <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
        <p className="text-[1.05rem] font-semibold text-gray-800">{perLine}</p>
        <p className="mt-1 text-[0.85rem] text-gray-500">
          The first payment is charged when you accept; the rest happen automatically each month.
          You’ll save a card on Stripe’s secure page — {clinicName} never sees the number.
        </p>
      </div>
      {canPay ? (
        <button
          type="button"
          onClick={accept}
          disabled={status === 'redirecting'}
          className="mt-6 w-full rounded-full px-6 py-3.5 text-[0.95rem] font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: brand }}
        >
          {status === 'redirecting' ? 'Opening secure setup…' : `Accept — first ${money(installmentCents)} today`}
        </button>
      ) : (
        <p className="mt-6 text-[0.9rem] text-gray-600">
          Online setup isn’t available right now — give the office a call
          {clinicPhone ? ` at ${clinicPhone}` : ''} and they’ll arrange it.
        </p>
      )}
      {status === 'error' && error && (
        <p className="mt-3 text-[0.88rem] text-rose-600" role="alert">{error}</p>
      )}
      <p className="mt-4 text-[0.8rem] text-gray-400">
        Rather handle it differently? Reply to the email or call the office — no pressure.
      </p>
    </>,
  )
}
