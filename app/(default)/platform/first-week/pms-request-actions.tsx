'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { answerPmsRequestAction, type PmsRequestAnswer } from './admin-actions'

/** The two answers the platform can give a connect request from the cockpit row. */
export default function PmsRequestActions({ orgId, status }: { orgId: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [active, setActive] = useState<PmsRequestAnswer | null>(null)
  const [error, setError] = useState<string | null>(null)
  function answer(a: PmsRequestAnswer) {
    setError(null)
    setActive(a)
    startTransition(async () => {
      const r = await answerPmsRequestAction(orgId, a)
      if (!r.ok) setError(r.error)
      else router.refresh()
    })
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {status !== 'scheduled' && (
        <ActionButton variant="ghost" size="sm" pending={pending && active === 'scheduled'} disabled={pending} onClick={() => answer('scheduled')}>
          Mark install scheduled
        </ActionButton>
      )}
      <ActionButton variant="ghost" size="sm" pending={pending && active === 'closed'} disabled={pending} onClick={() => answer('closed')}>
        Close request
      </ActionButton>
      {error && <span className="text-xs text-amber-700 dark:text-amber-300">{error}</span>}
    </div>
  )
}
