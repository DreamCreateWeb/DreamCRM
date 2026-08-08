'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { bindNexHealthAction } from '../admin-actions'

/**
 * Platform-ops NexHealth binding card (onboarding overhaul §2.6). The
 * institution + sync live in the NexHealth developer portal and the
 * Synchronizer install happens on the practice's server first; this card is
 * the last step — pointing the clinic org at its (subdomain, location) so
 * data starts flowing. Validates against the live API before saving.
 */
export default function NexHealthCard({
  organizationId,
  current,
}: {
  organizationId: string
  /** Existing binding, when the org's PMS connection is the NexHealth bridge. */
  current: { subdomain: string; locationId: number; sandbox: boolean } | null
}) {
  const router = useRouter()
  const [subdomain, setSubdomain] = useState(current?.subdomain ?? '')
  const [locationId, setLocationId] = useState(current ? String(current.locationId) : '')
  const [sandbox, setSandbox] = useState(current?.sandbox ?? false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function bind() {
    setError(null)
    setResult(null)
    const loc = Number.parseInt(locationId, 10)
    if (!subdomain.trim() || !Number.isFinite(loc) || loc <= 0) {
      setError('Enter the institution subdomain and a numeric location id.')
      return
    }
    startTransition(async () => {
      const r = await bindNexHealthAction({
        orgId: organizationId,
        subdomain: subdomain.trim(),
        locationId: loc,
        sandbox,
      }).catch(() => ({ ok: false as const, error: 'Something went wrong — try again.' }))
      if (r.ok) {
        setResult(
          `Bound to ${r.practiceTitle ?? subdomain}${r.note ? ` — ${r.note}` : ''}. The hourly sync takes it from here.`,
        )
        router.refresh()
      } else {
        setError(r.error)
      }
    })
  }

  return (
    <div className="v2-card p-4">
      <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
        Practice software — NexHealth bridge
      </h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        {current
          ? `Bound to '${current.subdomain}' · location ${current.locationId}${current.sandbox ? ' · SANDBOX' : ''}.`
          : 'After the portal setup + Synchronizer install, bind the institution here to start the sync.'}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-600 dark:text-gray-300">
          Subdomain
          <input
            type="text"
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
            placeholder="their-practice"
            disabled={pending}
            className="form-input mt-1 block w-44 text-sm"
          />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-300">
          Location id
          <input
            type="text"
            inputMode="numeric"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            placeholder="353605"
            disabled={pending}
            className="form-input mt-1 block w-28 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 pb-2">
          <input
            type="checkbox"
            checked={sandbox}
            onChange={(e) => setSandbox(e.target.checked)}
            disabled={pending}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Sandbox
        </label>
        <button
          type="button"
          onClick={bind}
          disabled={pending}
          className="btn-sm bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60"
        >
          {pending ? 'Checking…' : current ? 'Rebind' : 'Bind + test'}
        </button>
      </div>
      {result && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{result}</p>}
      {error && (
        <p className="mt-2 text-xs text-rose-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
