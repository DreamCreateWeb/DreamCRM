'use client'

import { useState, useTransition } from 'react'
import { Toggle } from '@/components/ui/toggle'
import { setPoweredByVisibilityAction } from './actions'

/**
 * The site-credit switch card on Website → Design. The credit is a thin
 * "Powered by DreamCRM" line under the site's footer — on by default, and
 * this is the one off switch. Live-instant (no Publish step), and the copy
 * says so.
 */
export default function PoweredByCard({ initialHidden }: { initialHidden: boolean }) {
  const [hidden, setHidden] = useState(initialHidden)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onToggle(showCredit: boolean) {
    const nextHidden = !showCredit
    setHidden(nextHidden)
    setError(null)
    startTransition(async () => {
      const res = await setPoweredByVisibilityAction(nextHidden)
      if (!res.ok) {
        setHidden(!nextHidden)
        setError(res.error)
      }
    })
  }

  return (
    <section className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Site credit</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-lg">
            A small “Powered by DreamCRM” line at the very bottom of your site, under your footer.
            Turning it off applies right away — no publish needed.
          </p>
          {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
        <Toggle checked={!hidden} onChange={onToggle} disabled={pending} srLabel="Show the Powered by DreamCRM credit" />
      </div>
    </section>
  )
}
