'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { runAction } from '@/lib/run-action'
import { linkSubmissionAction, createPatientFromSubmissionAction } from '../../actions'

/**
 * The unlinked submission's two doors: "Link to <patient>" (the near match the
 * family-safe guard refused) and "Add <name> as a patient" (with the duplicate
 * prompt). Every action is awaited inside try/finally so a refused action
 * after a redeploy never leaves the button stuck.
 */
export default function LinkPanel({
  submissionId,
  displayName,
  nearMatch,
}: {
  submissionId: string
  displayName: string
  nearMatch: { id: string; name: string } | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null)

  async function link(patientId: string) {
    setBusy(true)
    setError(null)
    try {
      const r = await runAction(() => linkSubmissionAction(submissionId, patientId))
      if (!r.ok) setError(r.error)
      else router.refresh()
    } catch {
      setError('That did not go through. Refresh the page and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function add(forceNew: boolean) {
    setBusy(true)
    setError(null)
    try {
      const r = await runAction(() => createPatientFromSubmissionAction({ submissionId, forceNew }))
      if ('duplicateOf' in r) setDuplicate(r.duplicateOf)
      else if (!r.ok) setError(r.error)
      else {
        setDuplicate(null)
        router.refresh()
      }
    } catch {
      setError('That did not go through. Refresh the page and try again.')
    } finally {
      setBusy(false)
    }
  }

  const btn =
    'rounded-[var(--r-sm)] px-2.5 py-1 text-xs font-medium ring-1 ring-inset ring-[color:var(--color-hairline-strong)] hover:bg-gray-500/10 disabled:opacity-50'
  return (
    <div className="mt-2 space-y-2 text-xs text-amber-700 dark:text-amber-300">
      <p>Not linked to a patient record.</p>
      <div className="flex flex-wrap items-center gap-2">
        {nearMatch && (
          <button type="button" className={btn} disabled={busy} onClick={() => link(nearMatch.id)}>
            Link to {nearMatch.name}
          </button>
        )}
        <button type="button" className={btn} disabled={busy} onClick={() => add(false)}>
          Add {displayName} as a patient
        </button>
      </div>
      {duplicate && (
        <div role="status" className="space-y-1.5 text-gray-700 dark:text-gray-200">
          <p>
            <Link href={`/patients/${duplicate.id}`} className="font-medium underline">
              {duplicate.name}
            </Link>{' '}
            already has this email or phone. Link to them, or add a separate record?
          </p>
          <div className="flex gap-2">
            <button type="button" className={btn} disabled={busy} onClick={() => link(duplicate.id)}>
              Link to {duplicate.name}
            </button>
            <button type="button" className={btn} disabled={busy} onClick={() => add(true)}>
              Add anyway
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}
