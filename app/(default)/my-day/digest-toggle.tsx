'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { setMyDigestOptOutAction } from './actions'
import { setDigestEnabledAction } from '@/app/(default)/followups/actions'
import { runAction } from '@/lib/run-action'

/**
 * The personal email switch on My Day: one opt-out covers BOTH recurring
 * staff emails — the morning digest (when the clinic has it on) and the
 * Monday week-in-review (every clinic). Always rendered (round-3 audit:
 * hiding it behind the digest org-toggle left the weekly email with no
 * reachable off switch); lets one staff member mute their own email without
 * affecting the team. Optimistic; reverts on error.
 */
export default function DigestToggle({
  initialOptedOut,
  digestEnabled = true,
  canManageOrgDigest = false,
}: {
  initialOptedOut: boolean
  /** Whether the clinic sends the MORNING digest — words the label honestly
   *  (the Monday email sends either way). */
  digestEnabled?: boolean
  /** Owner / admin: may turn the clinic's morning digest on from here. */
  canManageOrgDigest?: boolean
}) {
  const [orgOn, setOrgOn] = useState(digestEnabled)
  const [orgError, setOrgError] = useState<string | null>(null)
  const [orgPending, startOrg] = useTransition()

  function turnOnOrgDigest() {
    setOrgError(null)
    startOrg(async () => {
      const res = await runAction(() => setDigestEnabledAction(true))
      if (res.ok) setOrgOn(true)
      else setOrgError(res.error)
    })
  }

  const [optedOut, setOptedOut] = useState(initialOptedOut)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !optedOut
    setOptedOut(next)
    setError(null)
    startTransition(async () => {
      const res = await runAction(async () => {
        const r = await setMyDigestOptOutAction(next)
        return 'error' in r ? { ok: false as const, error: r.error } : r
      })
      if (!res.ok) { setOptedOut(!next); setError(res.error) }
    })
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-hairline)] pt-4 text-sm text-gray-500 dark:text-gray-400">
      <span>
        📬 My email reports:{' '}
        <span className="font-medium text-gray-700 dark:text-gray-200">{optedOut ? 'Off' : 'On'}</span>
        {optedOut
          ? ' — you won’t get the Monday week-in-review or the morning digest.'
          : orgOn
            ? ' — you get the morning digest and the Monday week-in-review by email.'
            : ' — you get the Monday week-in-review by email.'}
      </span>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="rounded-md px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-500/40 hover:bg-teal-500/10 disabled:opacity-50 dark:text-teal-300"
      >
        {pending ? '…' : optedOut ? 'Turn on' : 'Turn off'}
      </button>
      {error && <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span>}
      {!orgOn && (
        <div className="basis-full flex flex-wrap items-center gap-2">
          <span>Your clinic&rsquo;s morning digest is off.</span>
          {canManageOrgDigest ? (
            <button
              type="button"
              onClick={turnOnOrgDigest}
              disabled={orgPending}
              className="rounded-md px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-500/40 hover:bg-teal-500/10 disabled:opacity-50 dark:text-teal-300"
            >
              {orgPending ? '…' : 'Turn it on'}
            </button>
          ) : (
            <Link href="/settings/notifications" className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-300">
              Notification settings →
            </Link>
          )}
          {orgError && <span className="text-xs text-rose-600 dark:text-rose-400">{orgError}</span>}
        </div>
      )}
    </div>
  )
}
