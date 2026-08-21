'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { startBrandedDemoAction, reEnrichProspectAction } from '../../admin-actions'

/** Header action strip on the prep page: the demo launcher + freshness. */
export default function PrepActions({ prospectId }: { prospectId: string }) {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [active, setActive] = useState<'demo' | 'enrich' | null>(null)

  return (
    <div className="no-print flex items-center gap-2">
      {/* Demoted: the track-picker's launcher (which carries the chosen
          track) is the page's one primary — two breathing gradients on one
          screen was the scout's headline find. */}
      <ActionButton
        variant="secondary"
        pending={pending && active === 'demo'}
        disabled={pending}
        onClick={() => {
          setActive('demo')
          startTransition(async () => {
            // Pre-open the script window INSIDE the click gesture (popup
            // blockers kill window.open after an await).
            const script = window.open('', 'dcDemoScript', 'width=440,height=780')
            const res = await startBrandedDemoAction(prospectId)
            if (script) script.location.href = '/demo/script'
            window.location.assign(res.to)
          })
        }}
      >
        🎬 Start branded demo
      </ActionButton>
      <ActionButton
        variant="secondary"
        pending={pending && active === 'enrich'}
        disabled={pending}
        title="Recrawl their site + refresh Google data + rescore"
        onClick={() => {
          setActive('enrich')
          startTransition(async () => {
            setNote(null)
            const r = await reEnrichProspectAction(prospectId)
            setNote(r.ok ? 'Refreshed.' : r.reason === 'budget' ? 'Budget used up this month.' : 'Refresh failed.')
            setActive(null)
          })
        }}
      >
        ↻ Re-enrich
      </ActionButton>
      <ActionButton variant="ghost" onClick={() => window.print()}>
        🖨 Print
      </ActionButton>
      {note && <span role="status" className="text-xs text-gray-500 dark:text-gray-400">{note}</span>}
    </div>
  )
}
