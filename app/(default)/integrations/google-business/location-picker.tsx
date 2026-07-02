'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setPreferredGbpAccountAction } from '../actions'

/**
 * Multi-location Google accounts: pick which location is THE clinic's.
 * Reviews, local metrics, listing sync, and posting all resolve through this
 * choice (resolveGbpAccount). Only rendered when >1 GBP location came back
 * from the connection — single-location clinics never see it.
 */
export default function GbpLocationPicker({
  accounts,
  selectedId,
  canManage,
}: {
  accounts: Array<{ id: string; label: string }>
  selectedId: string
  canManage: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState(selectedId)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  function save(next: string) {
    setValue(next)
    setSaved(false)
    setError('')
    startTransition(async () => {
      const r = await setPreferredGbpAccountAction(next)
      if (r.ok) {
        setSaved(true)
        router.refresh()
      } else {
        setError(r.error)
        setValue(selectedId)
      }
    })
  }

  return (
    <div className="mt-4 rounded-[var(--r-md)] border border-[color:var(--color-hairline)] p-3">
      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
        Your location
      </label>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        This Google account manages several locations — reviews, local search numbers, and
        listing sync all follow the one you pick here.
      </p>
      <div className="flex items-center gap-2">
        <select
          className="form-select text-sm max-w-full"
          value={value}
          onChange={(e) => save(e.target.value)}
          disabled={!canManage || pending}
          aria-label="Which Google Business location is this clinic"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        {pending && <span className="text-xs text-gray-400">Saving…</span>}
        {saved && !pending && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved ✓</span>}
      </div>
      {error && <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {!canManage && (
        <p className="mt-1.5 text-[11px] text-gray-400">Changing the location needs an owner or admin.</p>
      )}
    </div>
  )
}
