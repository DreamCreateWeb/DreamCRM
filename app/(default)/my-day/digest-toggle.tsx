'use client'

import { useState, useTransition } from 'react'
import { setMyDigestOptOutAction } from './actions'

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
}: {
  initialOptedOut: boolean
  /** Whether the clinic sends the MORNING digest — words the label honestly
   *  (the Monday email sends either way). */
  digestEnabled?: boolean
}) {
  const [optedOut, setOptedOut] = useState(initialOptedOut)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !optedOut
    setOptedOut(next)
    setError(null)
    startTransition(async () => {
      const res = await setMyDigestOptOutAction(next)
      if ('error' in res) { setOptedOut(!next); setError(res.error) }
    })
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-hairline)] pt-4 text-sm text-gray-500 dark:text-gray-400">
      <span>
        📬 My email reports:{' '}
        <span className="font-medium text-gray-700 dark:text-gray-200">{optedOut ? 'Off' : 'On'}</span>
        {optedOut
          ? ' — you won’t get the Monday week-in-review or the morning digest.'
          : digestEnabled
            ? ' — you get the morning digest and the Monday week-in-review by email.'
            : ' — you get the Monday week-in-review by email.'}
      </span>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="rounded-md px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-500/40 hover:bg-teal-500/10 disabled:opacity-50 dark:text-teal-300"
      >
        {optedOut ? 'Turn on' : 'Turn off'}
      </button>
      {error && <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span>}
    </div>
  )
}
