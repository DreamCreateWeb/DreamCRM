'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { US_STATE_NAMES } from '@/lib/types/us-geo'
import { setFocusStateAction } from './admin-actions'

/** The focus-mode banner — shown on the main prospecting surface when the
 *  owner has focused a state. A lens, not an engine change: it links to the
 *  filtered list and offers a one-click clear. */
export default function FocusBanner({ state }: { state: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const name = (US_STATE_NAMES as Record<string, string>)[state] ?? state

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-sm)] border border-teal-500/30 bg-teal-500/5 px-4 py-3">
      <div className="text-sm text-gray-800 dark:text-gray-100">
        <span aria-hidden="true">★</span> Focused on <span className="font-semibold">{name}</span> —
        concentrate the hunt here.
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/platform/prospecting?state=${state}`}
          className="rounded-[var(--r-xs)] bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
        >
          View {state} prospects
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setFocusStateAction(null)
              router.refresh()
            })
          }
          className="rounded-[var(--r-xs)] border border-[color:var(--color-hairline-strong)] px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60"
        >
          Clear focus
        </button>
      </div>
    </div>
  )
}
