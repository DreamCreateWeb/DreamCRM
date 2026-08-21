'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { useToast } from '@/components/ui/toast'
import { US_STATE_NAMES } from '@/lib/types/us-geo'
import { setFocusStateAction } from './admin-actions'

/** The focus-mode banner — shown on the main prospecting surface when the
 *  owner has focused a state. A lens, not an engine change: it links to the
 *  filtered list and offers a one-click clear. */
export default function FocusBanner({ state }: { state: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const name = (US_STATE_NAMES as Record<string, string>)[state] ?? state

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-sm)] bg-teal-500/5 ring-1 ring-inset ring-teal-500/20 px-4 py-3">
      <div className="text-sm text-gray-800 dark:text-gray-100">
        <span aria-hidden="true">★</span> Focused on <span className="font-semibold">{name}</span> —
        concentrate the hunt here.
      </div>
      <div className="flex items-center gap-2">
        <ActionButton href={`/platform/prospecting?state=${state}`} variant="secondary" size="sm">
          View {state} prospects
        </ActionButton>
        <ActionButton
          variant="ghost"
          size="sm"
          pending={pending}
          onClick={() =>
            startTransition(async () => {
              await setFocusStateAction(null)
              toast(`Focus cleared — the hunt is nationwide again`)
              router.refresh()
            })
          }
        >
          Clear focus
        </ActionButton>
      </div>
    </div>
  )
}
