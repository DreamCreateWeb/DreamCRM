'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { useToast } from '@/components/ui/toast'
import { isStaleFailure, runAction } from '@/lib/run-action'
import { fillMyQueueAction } from './actions'

/** "Fill my queue" — the caller's own top-up, the cron's job on demand. */
export default function FillQueueButton({ holding, target }: { holding: number; target: number }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [stale, setStale] = useState(false)
  const full = holding >= target

  if (stale) {
    return (
      <ActionButton variant="secondary" onClick={() => window.location.reload()}>
        Refresh to continue
      </ActionButton>
    )
  }
  return (
    <ActionButton
      variant={full ? 'secondary' : 'primary'}
      pending={pending}
      disabled={pending}
      title={full ? `You hold ${holding} of ${target} — the queue is full` : `Top up to ${target} practices`}
      onClick={() =>
        startTransition(async () => {
          const r = await runAction(() => fillMyQueueAction())
          if (!r.ok) {
            if (isStaleFailure(r)) setStale(true)
            toast(r.error, { tone: 'urgent' })
            return
          }
          toast(
            r.claimed === 0
              ? full
                ? 'Your queue is already full'
                : 'Nothing new to add right now — Dream Create is finding more'
              : `${r.claimed} more practice${r.claimed === 1 ? '' : 's'} in your queue`,
          )
          router.refresh()
        })
      }
    >
      {full ? 'Queue is full' : 'Fill my queue'}
    </ActionButton>
  )
}
