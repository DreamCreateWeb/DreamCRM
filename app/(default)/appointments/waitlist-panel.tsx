'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { StatusPill } from '@/components/ui/status-pill'
import { FlashToast } from '@/components/ui/flash-toast'
import { removeFromWaitlistAction } from './actions'

/** Serializable entry shape (page.tsx maps service Dates → ISO strings). */
export interface WaitlistPanelEntry {
  id: string
  patientId: string
  patientName: string
  visitTypeLabel: string
  providerName: string | null
  currentVisitAtIso: string | null
  pendingOffers: number
}

/**
 * The fast-pass strip on /appointments — who's waiting for an earlier slot.
 * Quiet when empty (renders nothing); collapsible when present. Offers go out
 * automatically on cancellations — this panel is visibility + removal.
 */
export default function WaitlistPanel({ entries }: { entries: WaitlistPanelEntry[] }) {
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  if (entries.length === 0) return null

  function remove(id: string, name: string) {
    startTransition(async () => {
      await removeFromWaitlistAction(id)
      setToast(`${name} removed from the fast-pass list.`)
      router.refresh()
    })
  }

  return (
    <div className="v2-card mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
          <span aria-hidden="true">⚡</span>
          Fast-pass list
          <span className="font-mono-num tabular-nums text-gray-500 dark:text-gray-400">({entries.length})</span>
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {open ? 'Hide' : `${entries.length === 1 ? '1 patient wants' : `${entries.length} patients want`} an earlier time — cancellations auto-offer their slot`}
        </span>
      </button>

      {open && (
        <ul className="divide-y divide-[color:var(--color-hairline)] border-t border-[color:var(--color-hairline)]">
          {entries.map((e) => (
            <li key={e.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="min-w-0 flex items-center gap-2 flex-wrap">
                <Link href={`/patients/${e.patientId}`} className="font-medium text-gray-800 dark:text-gray-100 hover:underline">
                  {e.patientName}
                </Link>
                <span className="text-gray-600 dark:text-gray-300">
                  {e.visitTypeLabel.toLowerCase()}
                  {e.providerName ? ` with ${e.providerName}` : ''}
                </span>
                {e.currentVisitAtIso && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    currently {new Date(e.currentVisitAtIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                {e.pendingOffers > 0 && (
                  <StatusPill tone="info" title="An offer email is out — waiting on their click">
                    offer out
                  </StatusPill>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(e.id, e.patientName)}
                disabled={pending}
                className="text-xs font-medium text-gray-400 hover:text-rose-600 dark:text-gray-500 dark:hover:text-rose-400 rounded px-2 py-1 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
