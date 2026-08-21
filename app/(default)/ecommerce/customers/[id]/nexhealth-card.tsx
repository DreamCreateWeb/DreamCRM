'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { bindNexHealthAction, setNexHealthWriteBackAction } from '../admin-actions'
import { ActionButton } from '@/components/ui/action-button'

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
  current: {
    subdomain: string
    locationId: number
    sandbox: boolean
    monthCalls?: number
    writeBack?: boolean
  } | null
}) {
  const router = useRouter()
  const [subdomain, setSubdomain] = useState(current?.subdomain ?? '')
  const [locationId, setLocationId] = useState(current ? String(current.locationId) : '')
  const [sandbox, setSandbox] = useState(current?.sandbox ?? false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [active, setActive] = useState<'bind' | 'writeback' | null>(null)

  function bind() {
    setError(null)
    setResult(null)
    const loc = Number.parseInt(locationId, 10)
    if (!subdomain.trim() || !Number.isFinite(loc) || loc <= 0) {
      setError('Enter the institution subdomain and a numeric location id.')
      return
    }
    setActive('bind')
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
      setActive(null)
    })
  }

  return (
    <div className="v2-card p-4">
      <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
        Practice software — NexHealth bridge
      </h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        {current
          ? `Bound to '${current.subdomain}' · location ${current.locationId}${current.sandbox ? ' · SANDBOX' : ''} · ${current.monthCalls ?? 0} API calls this month${current.sandbox ? ' (free)' : ''}.`
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
            className="form-checkbox"
          />
          Sandbox
        </label>
        <ActionButton
          variant="primary"
          size="sm"
          onClick={bind}
          pending={pending && active === 'bind'}
          disabled={pending}
        >
          {pending && active === 'bind' ? 'Checking…' : current ? 'Rebind' : 'Bind + test'}
        </ActionButton>
      </div>
      {current && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/60">
          <label className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={current.writeBack ?? false}
              disabled={pending}
              onChange={(e) => {
                const enabled = e.target.checked
                setError(null)
                setResult(null)
                setActive('writeback')
                startTransition(async () => {
                  const r = await setNexHealthWriteBackAction({ orgId: organizationId, enabled }).catch(
                    () => ({ ok: false as const, error: 'Something went wrong — try again.' }),
                  )
                  if (r.ok) {
                    setResult(
                      enabled
                        ? 'Write-back ON — DreamCRM bookings and cancellations now push into their practice system on each sync.'
                        : 'Write-back OFF — nothing is pushed; queued writes wait.',
                    )
                    router.refresh()
                  } else {
                    setError(r.error)
                  }
                  setActive(null)
                })
              }}
              className="form-checkbox mt-0.5"
            />
            <span>
              <span className="font-semibold text-gray-800 dark:text-gray-100">
                Write-back {current.writeBack ? 'ON' : 'OFF'}
              </span>{' '}
              — push DreamCRM bookings + cancellations into their practice system. Ships OFF: flip
              only after the Synchronizer is verified live (writes go out only into times their own
              schedule shows open, and their server refuses double-books, but this writes into a
              live PMS — deliberate hands only).
            </span>
          </label>
        </div>
      )}
      {result && (
        <p role="status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
          {result}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-rose-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
