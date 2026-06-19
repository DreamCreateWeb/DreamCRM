'use client'

import { useState, useTransition } from 'react'
import { setMyDigestOptOutAction } from './actions'

/**
 * The personal "email me this each morning" switch on My Day. Only rendered when
 * the clinic has the morning digest enabled org-wide; this lets one staff member
 * mute their own email without affecting the team. Optimistic; reverts on error.
 */
export default function DigestToggle({ initialOptedOut }: { initialOptedOut: boolean }) {
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
        📬 Morning email:{' '}
        <span className="font-medium text-gray-700 dark:text-gray-200">{optedOut ? 'Off' : 'On'}</span>
        {optedOut ? ' — you won’t get the daily digest.' : ' — you get this as an email each morning.'}
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
