'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { useToast } from '@/components/ui/toast'
import { isStaleFailure, runAction } from '@/lib/run-action'
import { assignProspectToCallerAction } from './admin-actions'

/**
 * The drawer's "Assigned to <caller>" strip (P-02): who holds this practice,
 * Reassign to another active caller, or Unassign (back to the pool and the
 * owner's own queues). Nothing here when no caller exists yet.
 */
export default function AssignCallerControl({
  prospectId,
  assigned,
  callers,
}: {
  prospectId: string
  assigned: { id: string; name: string } | null
  callers: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const toast = useToast()
  const [pick, setPick] = useState(assigned?.id ?? '')
  const [pending, startTransition] = useTransition()
  const [active, setActive] = useState<'assign' | 'unassign' | null>(null)
  const [stale, setStale] = useState(false)

  if (callers.length === 0 && !assigned) return null

  const run = (kind: 'assign' | 'unassign', callerId: string | null, done: string) => {
    setActive(kind)
    startTransition(async () => {
      try {
        const r = await runAction(() => assignProspectToCallerAction(prospectId, callerId))
        if (!r.ok) {
          if (isStaleFailure(r)) setStale(true)
          toast(r.error, { tone: 'urgent' })
          return
        }
        toast(done)
        router.refresh()
      } finally {
        setActive(null)
      }
    })
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-gray-500 dark:text-gray-400">
        {assigned ? (
          <>
            Assigned to <span className="font-medium text-gray-900 dark:text-gray-100">{assigned.name}</span>
          </>
        ) : (
          'Not with a caller'
        )}
      </span>
      {stale ? (
        <ActionButton size="sm" variant="secondary" onClick={() => window.location.reload()}>
          Refresh
        </ActionButton>
      ) : (
        <>
          {callers.length > 0 && (
            <>
              <select
                aria-label="Caller"
                className="form-select text-sm"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                disabled={pending}
              >
                <option value="">Pick a caller…</option>
                {callers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ActionButton
                size="sm"
                variant="secondary"
                pending={pending && active === 'assign'}
                disabled={pending || !pick || pick === assigned?.id}
                onClick={() => run('assign', pick, `Handed to ${callers.find((c) => c.id === pick)?.name ?? 'the caller'}`)}
              >
                {assigned ? 'Reassign' : 'Assign'}
              </ActionButton>
            </>
          )}
          {assigned && (
            <ActionButton
              size="sm"
              variant="ghost"
              pending={pending && active === 'unassign'}
              disabled={pending}
              onClick={() => run('unassign', null, 'Back in the pool — your own queues see it again')}
            >
              Unassign
            </ActionButton>
          )}
        </>
      )}
    </div>
  )
}
