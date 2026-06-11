'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'
import { PAYOUT_MIN_CENTS, moneyExact, type PartnerStatus } from '@/lib/types/referrals'
import { payoutPartnerAction, setPartnerStatusAction, resendPartnerInviteAction } from '../admin-actions'

/**
 * Header action group for the partner detail page: admin-triggered "Pay now"
 * (when payouts are ready + balance over the minimum) + suspend/reactivate, or
 * resend-invite while still 'invited'.
 */
export default function PartnerActions({
  partnerId,
  status,
  accruedCents,
  payoutReady,
}: {
  partnerId: string
  status: PartnerStatus
  accruedCents: number
  payoutReady: boolean
}) {
  const [toast, setToast] = useState<string | null>(null)
  const [toastTone, setToastTone] = useState<'ok' | 'urgent'>('ok')
  const [pending, startTransition] = useTransition()

  const canPay = status === 'active' && payoutReady && accruedCents >= PAYOUT_MIN_CENTS

  function pay() {
    startTransition(async () => {
      const r = await payoutPartnerAction(partnerId)
      if (r.ok) {
        setToastTone('ok')
        setToast(`Paid ${moneyExact(r.amountCents ?? 0)}`)
      } else {
        setToastTone('urgent')
        setToast(r.error ?? 'Payout failed')
      }
    })
  }

  function toggleSuspend() {
    const next = status === 'suspended' ? 'active' : 'suspended'
    startTransition(async () => {
      try {
        await setPartnerStatusAction(partnerId, next)
        setToastTone('ok')
        setToast(next === 'suspended' ? 'Partner suspended' : 'Partner reactivated')
      } catch (err) {
        setToastTone('urgent')
        setToast((err as Error).message)
      }
    })
  }

  function resend() {
    startTransition(async () => {
      try {
        const r = await resendPartnerInviteAction(partnerId)
        setToastTone('ok')
        setToast(`Invite re-sent to ${r.email}`)
      } catch (err) {
        setToastTone('urgent')
        setToast((err as Error).message)
      }
    })
  }

  return (
    <>
      {status === 'invited' && (
        <ActionButton variant="secondary" size="sm" onClick={resend} disabled={pending}>
          Resend invite
        </ActionButton>
      )}
      {status !== 'invited' && (
        <ActionButton variant="ghost" size="sm" onClick={toggleSuspend} disabled={pending}>
          {status === 'suspended' ? 'Reactivate' : 'Suspend'}
        </ActionButton>
      )}
      {status === 'active' && (
        <ActionButton
          variant="primary"
          breath
          onClick={pay}
          disabled={pending || !canPay}
          title={
            !payoutReady
              ? 'Partner hasn’t set up a payout method yet'
              : accruedCents < PAYOUT_MIN_CENTS
                ? `Balance under the ${moneyExact(PAYOUT_MIN_CENTS)} minimum`
                : undefined
          }
        >
          {pending ? 'Paying…' : `Pay now (${moneyExact(accruedCents)})`}
        </ActionButton>
      )}
      {toast && <FlashToast message={toast} tone={toastTone} onDone={() => setToast(null)} />}
    </>
  )
}
