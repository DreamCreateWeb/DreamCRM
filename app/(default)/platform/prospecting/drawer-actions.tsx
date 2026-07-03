'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { suppressProspectAction } from './admin-actions'

/**
 * Drawer action strip. Phase 2 ships Suppress (permanent, fail-closed);
 * Enroll / Convert / Branded demo land with their phases — no dead buttons
 * before their machinery exists (the no-fake-content rule).
 */
export default function DrawerActions({
  prospectId,
  status,
  hasEmail,
}: {
  prospectId: string
  status: string
  hasEmail: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  if (status === 'suppressed' || status === 'converted') return null

  return (
    <div className="mt-6 pt-4 border-t border-[color:var(--color-hairline)] flex flex-wrap items-center gap-2">
      {confirming ? (
        <>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Never contact this practice again{hasEmail ? ' (email suppressed forever)' : ''}?
          </span>
          <ActionButton
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() => startTransition(() => suppressProspectAction(prospectId))}
          >
            Yes, suppress
          </ActionButton>
          <ActionButton size="sm" variant="secondary" onClick={() => setConfirming(false)}>
            Cancel
          </ActionButton>
        </>
      ) : (
        <ActionButton size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          🚫 Suppress
        </ActionButton>
      )}
    </div>
  )
}
