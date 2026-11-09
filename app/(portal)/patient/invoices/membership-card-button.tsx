'use client'

import { useState, useTransition } from 'react'
import { startMembershipCardUpdateAction } from './actions'
import { runAction } from '@/lib/run-action'
import { PORTAL_RUN } from '@/components/patient-portal/stale-reload'
import { PORTAL_DANGER_INK, BrandButton } from '@/components/patient-portal/ui'

/** "Update your card" on a past-due membership: opens Stripe's own card page. */
export default function MembershipCardButton({ brand }: { brand: string }) {
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const go = () => {
    setError('')
    startTransition(async () => {
      const res = await runAction(() => startMembershipCardUpdateAction(), PORTAL_RUN)
      if (res.ok) window.location.assign(res.url)
      else setError(res.error)
    })
  }

  return (
    <div className="mt-3">
      <BrandButton brand={brand} pending={pending} onClick={go} className="px-5 py-2.5 text-[0.88rem]">
        Update your card
      </BrandButton>
      {error && (
        <p role="alert" className="mt-2 text-[0.85rem] font-medium" style={{ color: PORTAL_DANGER_INK }}>
          {error}
        </p>
      )}
    </div>
  )
}
