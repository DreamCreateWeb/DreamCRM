'use client'

import { useState, useTransition } from 'react'
import { requestPmsAccessAction } from './actions'

/**
 * The "notify me when this PMS is ready" affordance on a roadmap PMS tile
 * (Dentrix Ascend/desktop, Eaglesoft, Curve). Records the clinic's interest
 * so the founder can prioritize the vendor partnership — and email this
 * clinic the day it ships. Honest by construction: it never claims the
 * integration works, it captures demand for one that doesn't exist yet.
 */
export default function PmsRequestButton({
  provider,
  alreadyRequested,
  canManage,
}: {
  provider: string
  alreadyRequested: boolean
  canManage: boolean
}) {
  const [requested, setRequested] = useState(alreadyRequested)
  const [waiting, setWaiting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (requested) {
    return (
      <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
        ✓ You&rsquo;re on the list
        {waiting != null && waiting > 1 ? (
          <span className="font-normal text-gray-500 dark:text-gray-400">
            {' '}
            — you + {waiting - 1} other {waiting - 1 === 1 ? 'practice' : 'practices'} waiting
          </span>
        ) : (
          <span className="font-normal text-gray-500 dark:text-gray-400">
            {' '}
            — we&rsquo;ll email you the day it&rsquo;s live
          </span>
        )}
      </p>
    )
  }

  if (!canManage) {
    return (
      <p className="text-xs italic text-gray-500 dark:text-gray-400">
        Ask an owner or admin to request early access.
      </p>
    )
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const r = await requestPmsAccessAction(provider)
            if (r.ok) {
              setRequested(true)
              setWaiting(r.waiting ?? null)
            } else {
              setError(r.error ?? 'Something went wrong.')
            }
          })
        }
        className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300 dark:border-teal-700 px-3 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 disabled:opacity-50"
      >
        {pending ? 'Adding you…' : '🔔 Notify me when it’s ready'}
      </button>
      {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  )
}
