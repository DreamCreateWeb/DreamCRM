'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adjustLoyaltyPointsAction } from '../actions'

export interface LoyaltyPanelData {
  balance: number
  events: Array<{ id: string; kind: string; points: number; note: string | null; createdAtIso: string }>
}

const KIND_LABEL: Record<string, string> = {
  visit: 'Kept visit',
  referral: 'Referral',
  payment: 'Online payment',
  redeem: 'Redeemed',
  adjust: 'Adjustment',
}

/** The patient record's rewards rail card: balance, recent ledger, and an
 *  owner/admin quick adjust (comp / correction — note required). */
export default function LoyaltyPanel({
  patientId,
  data,
  canAdjust,
}: {
  patientId: string
  data: LoyaltyPanelData
  canAdjust: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [points, setPoints] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function adjust() {
    setError('')
    startTransition(async () => {
      const r = await adjustLoyaltyPointsAction(patientId, Number(points), note)
      if (r.ok) {
        setOpen(false)
        setPoints('')
        setNote('')
        router.refresh()
      } else {
        setError(r.error)
      }
    })
  }

  return (
    <div className="v2-card px-4 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
          Rewards
        </p>
        <p className="text-sm font-bold tabular-nums text-teal-700 dark:text-teal-400">
          {data.balance.toLocaleString()} pts
        </p>
      </div>
      {data.events.length > 0 && (
        <ul className="mt-2 space-y-1">
          {data.events.slice(0, 4).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-gray-600 dark:text-gray-300" title={e.note ?? undefined}>
                {KIND_LABEL[e.kind] ?? e.kind}
              </span>
              <span
                className={`shrink-0 font-mono tabular-nums ${
                  e.points >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {e.points >= 0 ? '+' : ''}
                {e.points}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canAdjust && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
        >
          Adjust points
        </button>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          <input
            type="number"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder="+50 or -20"
            aria-label="Points to add or remove"
            className="form-input w-full text-xs"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why? (required)"
            aria-label="Adjustment note"
            className="form-input w-full text-xs"
          />
          {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={adjust}
              disabled={pending}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
