'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelScheduledCampaignAction } from '../actions'

/**
 * Inline "cancel" affordance on a Scheduled campaign row — pulls it back to
 * draft (clears the queued send). Secondary/ghost styling so it never competes
 * with the campaign name link.
 */
export default function CancelScheduledButton({ campaignId }: { campaignId: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!confirm('Cancel the scheduled send and move this back to draft?')) return
        startTransition(async () => {
          const r = await cancelScheduledCampaignAction(campaignId)
          if (r.ok) router.refresh()
          else alert(r.error)
        })
      }}
      className="text-xs font-medium text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 disabled:opacity-50"
      title="Cancel the scheduled send (back to draft)"
    >
      {pending ? '…' : 'Cancel'}
    </button>
  )
}
