'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { cancelScheduledCampaignAction } from '../actions'

/**
 * Inline "cancel" affordance on a Scheduled campaign row — pulls it back to
 * draft (clears the queued send). Secondary/ghost styling so it never competes
 * with the campaign name link.
 */
export default function CancelScheduledButton({ campaignId }: { campaignId: number }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (
          !(await confirm({
            title: 'Cancel the scheduled send?',
            message: 'This moves the campaign back to draft.',
            confirmLabel: 'Cancel send',
            danger: true,
          }))
        )
          return
        startTransition(async () => {
          const r = await cancelScheduledCampaignAction(campaignId)
          if (r.ok) router.refresh()
          else toast(r.error, { tone: 'urgent' })
        })
      }}
      className="text-xs font-medium text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 disabled:opacity-50"
      title="Cancel the scheduled send (back to draft)"
    >
      {pending ? '…' : 'Cancel'}
    </button>
  )
}
