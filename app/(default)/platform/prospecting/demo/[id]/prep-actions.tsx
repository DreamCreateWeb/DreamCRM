'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { startBrandedDemoAction, reEnrichProspectAction } from '../../admin-actions'

/** Header action strip on the prep page: the demo launcher + freshness. */
export default function PrepActions({ prospectId }: { prospectId: string }) {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  return (
    <div className="no-print flex items-center gap-2">
      <ActionButton
        variant="primary"
        breath
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            // Pre-open the script window INSIDE the click gesture (popup
            // blockers kill window.open after an await).
            const script = window.open('', 'dcDemoScript', 'width=440,height=780')
            const res = await startBrandedDemoAction(prospectId)
            if (script) script.location.href = '/demo/script'
            window.location.assign(res.to)
          })
        }
      >
        🎬 Start branded demo
      </ActionButton>
      <ActionButton
        variant="secondary"
        disabled={pending}
        title="Recrawl their site + refresh Google data + rescore"
        onClick={() =>
          startTransition(async () => {
            setNote(null)
            const r = await reEnrichProspectAction(prospectId)
            setNote(r.ok ? 'Refreshed.' : r.reason === 'budget' ? 'Budget used up this month.' : 'Refresh failed.')
          })
        }
      >
        ↻ Re-enrich
      </ActionButton>
      <ActionButton variant="ghost" onClick={() => window.print()}>
        🖨 Print
      </ActionButton>
      {note && <span className="text-xs text-gray-500 dark:text-gray-400">{note}</span>}
    </div>
  )
}
