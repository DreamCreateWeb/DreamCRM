'use client'

import { useState, useTransition } from 'react'
import { startMyPaymentPlanAction } from '../actions'

const INK = '#1C1A17'
const MUTED = '#6B635A'
const BORDER = '#E8E2D9'

export interface PlanOption {
  months: number
  /** Monthly amount in cents (last month may differ — shown as lastCents). */
  perCents: number
  lastCents: number
}

function money(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/**
 * "Split into monthly payments" — the portal-side entry into payment plans.
 * Options are computed SERVER-side (floors already applied), the patient just
 * picks a cadence; confirming creates the proposal and routes straight to the
 * secure accept page (card save + first charge happen there, never here).
 */
export default function PlanOffer({
  options,
  brand,
}: {
  options: PlanOption[]
  brand: string
}) {
  const [open, setOpen] = useState(false)
  const [months, setMonths] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (options.length === 0) return null
  const chosen = options.find((o) => o.months === months) ?? null

  function start() {
    if (!chosen || pending) return
    setError(null)
    startTransition(async () => {
      const res = await startMyPaymentPlanAction(chosen.months)
      if (res.ok) {
        // The accept page lives outside the portal chrome — full navigation.
        window.location.assign(res.url)
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="mt-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[0.88rem] font-semibold underline-offset-2 hover:underline"
          style={{ color: brand }}
        >
          Or split it into monthly payments →
        </button>
      ) : (
        <div className="rounded-2xl p-4" style={{ backgroundColor: '#FAF7F2', border: `1px solid ${BORDER}` }}>
          <p className="text-[0.9rem] font-semibold" style={{ color: INK }}>
            Spread it out — pick what fits your month.
          </p>
          <p className="mt-1 text-[0.82rem] leading-relaxed" style={{ color: MUTED }}>
            Charged automatically to a card you save on the next page. Nothing is charged until
            you review and accept.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {options.map((o) => {
              const active = months === o.months
              return (
                <button
                  key={o.months}
                  type="button"
                  onClick={() => setMonths(o.months)}
                  aria-pressed={active}
                  className="rounded-full px-3.5 py-2 text-[0.85rem] font-semibold transition"
                  style={
                    active
                      ? { backgroundColor: brand, color: '#FFFFFF' }
                      : { backgroundColor: '#FFFFFF', color: INK, border: `1px solid ${BORDER}` }
                  }
                >
                  {o.months} months · {money(o.perCents)}/mo
                </button>
              )
            })}
          </div>
          {chosen && chosen.lastCents !== chosen.perCents && (
            <p className="mt-2 text-[0.78rem]" style={{ color: MUTED }}>
              The last payment is {money(chosen.lastCents)} so the total comes out exact.
            </p>
          )}
          {error && (
            <p className="mt-2 text-[0.82rem] font-medium" style={{ color: '#B4231F' }} role="alert">
              {error}
            </p>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={start}
              disabled={!chosen || pending}
              className="rounded-full px-5 py-2.5 text-[0.9rem] font-semibold text-white transition disabled:opacity-50"
              style={{ backgroundColor: brand }}
            >
              {pending ? 'Setting up…' : 'Review my plan'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[0.85rem] font-medium"
              style={{ color: MUTED }}
            >
              Never mind
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
