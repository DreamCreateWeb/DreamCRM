'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'
import { PAYOUT_MIN_CENTS, moneyExact, type PartnerStatus } from '@/lib/types/referrals'
import {
  payoutPartnerAction,
  setPartnerStatusAction,
  resendPartnerInviteAction,
  reactivatePartnerAction,
} from '../admin-actions'
import DeletePartnerModal from '../delete-partner-modal'

/**
 * Header action group for the partner detail page: admin-triggered "Pay now"
 * (when payouts are ready + balance over the minimum) + suspend/reactivate (or
 * resend-invite while still 'invited', or reactivate when archived) + the
 * destructive Delete (separated from the primary by a hairline, never adjacent).
 * Admin "Pay now" is allowed even when SUSPENDED (settling up).
 */
export default function PartnerActions({
  partnerId,
  partnerName,
  status,
  accruedCents,
  lifetimePaidCents,
  clinicCount,
  payoutReady,
}: {
  partnerId: string
  partnerName: string
  status: PartnerStatus
  accruedCents: number
  lifetimePaidCents: number
  clinicCount: number
  payoutReady: boolean
}) {
  const [toast, setToast] = useState<string | null>(null)
  const [toastTone, setToastTone] = useState<'ok' | 'urgent'>('ok')
  const [pending, startTransition] = useTransition()

  // Admin pay-now: allowed while active OR suspended (settling up); never for
  // archived (closed) or invited (no account yet).
  const canPay = (status === 'active' || status === 'suspended') && payoutReady && accruedCents >= PAYOUT_MIN_CENTS

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

  function reactivate() {
    startTransition(async () => {
      try {
        const r = await reactivatePartnerAction(partnerId)
        setToastTone(r.ok ? 'ok' : 'urgent')
        setToast(r.ok ? 'Partner reactivated' : r.error ?? 'Could not reactivate')
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
      {(status === 'active' || status === 'suspended') && (
        <ActionButton variant="ghost" size="sm" onClick={toggleSuspend} disabled={pending}>
          {status === 'suspended' ? 'Reactivate' : 'Suspend'}
        </ActionButton>
      )}
      {status === 'archived' && (
        <ActionButton variant="secondary" size="sm" onClick={reactivate} disabled={pending}>
          Reactivate
        </ActionButton>
      )}
      {(status === 'active' || status === 'suspended') && (
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
      {/* Destructive — kept apart from the primary by a hairline divider. */}
      {status !== 'archived' && (
        <span className="pl-2 ml-1 border-l border-[color:var(--color-hairline)]">
          <DeletePartnerModal
            partnerId={partnerId}
            partnerName={partnerName}
            clinicCount={clinicCount}
            accruedCents={accruedCents}
            lifetimePaidCents={lifetimePaidCents}
            payoutsEnabled={payoutReady}
            redirectOnDelete
          />
        </span>
      )}
      {toast && <FlashToast message={toast} tone={toastTone} onDone={() => setToast(null)} />}
    </>
  )
}
