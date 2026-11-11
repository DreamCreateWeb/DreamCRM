'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ActionButton } from '@/components/ui/action-button'
import { runAction } from '@/lib/run-action'
import { MERGED_ROW_WORDS, PROSPECT_STATUS_LABELS } from '@/lib/types/prospecting'
import { clearChainFlagAction } from './admin-actions'

/**
 * The drawer's "Not a chain" (P-04): lifts a chain / DSO flag for good. The
 * confirm is awaited BEFORE the transition (the dialog law); the action
 * rides runAction; the override is stored so nothing re-flags the row.
 */
export default function NotAChainButton({ prospectId, prospectName }: { prospectId: string; prospectName: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const confirm = useConfirm()
  const router = useRouter()

  return (
    <div className="mt-2" data-not-a-chain>
      <ActionButton
        size="sm"
        variant="secondary"
        pending={pending}
        disabled={pending}
        title="Lift the chain flag — this practice goes back into the pool and is never flagged again"
        onClick={async () => {
          // The dialog law: awaited BEFORE the transition.
          if (
            !(await confirm({
              title: `${prospectName} is not a chain?`,
              message: 'It goes back where it was in the pipeline, and neither the verify pass nor the chain sweep will flag it again.',
              confirmLabel: 'Not a chain',
            }))
          )
            return
          startTransition(async () => {
            setError(null)
            try {
              const r = await runAction(() => clearChainFlagAction(prospectId))
              if (!r.ok) {
                setError(
                  'error' in r
                    ? r.error
                    : r.reason === 'merged'
                      ? MERGED_ROW_WORDS
                      : r.reason === 'not_flagged'
                        ? 'This record is not flagged as a chain — refresh and look again.'
                        : 'Could not lift the flag — refresh and try again.',
                )
                return
              }
              toast(`Not a chain — back to ${PROSPECT_STATUS_LABELS[r.status as keyof typeof PROSPECT_STATUS_LABELS] ?? r.status}`)
              router.refresh()
            } finally {
              /* the transition settles the pending state */
            }
          })
        }}
      >
        Not a chain
      </ActionButton>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}
