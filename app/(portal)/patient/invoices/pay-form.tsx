'use client'

import { useState, useTransition } from 'react'
import { startBalancePaymentAction } from './actions'
import {
  PORTAL_DANGER_INK,
  PORTAL_INK,
  PORTAL_MUTED,
  PORTAL_BORDER,
  BrandButton,
} from '@/components/patient-portal/ui'

/**
 * Inline "pay your balance" — defaults to the full balance, allows a
 * smaller amount (life happens), then hands off to Stripe Checkout on the
 * clinic's connected account.
 */
export default function PayBalanceForm({
  balanceCents,
  brand,
}: {
  balanceCents: number
  brand: string
}) {
  const [amount, setAmount] = useState((balanceCents / 100).toFixed(2))
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () => {
    setError('')
    const cents = Math.round(parseFloat(amount) * 100)
    if (!Number.isFinite(cents) || cents < 100) {
      setError('The minimum online payment is $1.')
      return
    }
    if (cents > balanceCents) {
      setError('That’s more than your balance — pay up to the amount shown.')
      return
    }
    startTransition(async () => {
      const res = await startBalancePaymentAction(cents)
      if (res.ok) window.location.assign(res.url)
      else setError(res.error)
    })
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex items-center rounded-full bg-white px-4 py-2 focus-within:ring-2 focus-within:ring-slate-500 focus-within:ring-offset-1"
          style={{ border: `1px solid ${PORTAL_BORDER}` }}
        >
          <span className="mr-1 text-[0.9rem] font-semibold" style={{ color: PORTAL_MUTED }}>
            $
          </span>
          <input
            type="number"
            inputMode="decimal"
            min="1"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-24 bg-transparent text-[0.95rem] font-semibold outline-none"
            style={{ color: PORTAL_INK }}
            aria-label="Payment amount in dollars"
          />
        </div>
        <BrandButton brand={brand} onClick={submit} disabled={pending} className="px-5 py-2.5 text-[0.88rem]">
          {pending ? 'Heading to checkout…' : 'Pay online'}
        </BrandButton>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[0.82rem] font-medium" style={{ color: PORTAL_DANGER_INK }}>
          {error}
        </p>
      )}
      <p className="mt-2 text-[0.78rem]" style={{ color: PORTAL_MUTED }}>
        Card payments are processed securely by Stripe. Want to pay a different way? Call us.
      </p>
    </div>
  )
}
