'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FlashToast } from '@/components/ui/flash-toast'
import { PAYOUT_MIN_CENTS, moneyExact, type PayoutMethodState } from '@/lib/types/referrals'
import type { Tone } from '@/lib/ui/encodings'
import { startPayoutSetupAction, withdrawAction } from './actions'

/**
 * Payout-method card + withdraw button. Three method states:
 *   none    → "Set up payouts" (teal primary) → Stripe Express onboarding
 *   pending → "Finish setup" → resume onboarding
 *   active  → "Payouts active" pill + a "Withdraw $X" primary (≥ minimum)
 */
export default function PartnerPayout({
  method,
  methodLabelText,
  accruedCents,
  paused = false,
  payoutMethodPill,
}: {
  method: PayoutMethodState
  methodLabelText: string | null
  accruedCents: number
  /** When the partner is SUSPENDED, withdrawals are on hold — the button is
   *  disabled and a "paused" line replaces the normal copy. */
  paused?: boolean
  payoutMethodPill: { tone: Tone; label: string }
}) {
  const [toast, setToast] = useState<string | null>(null)
  const [toastTone, setToastTone] = useState<'ok' | 'urgent'>('ok')
  const [pending, startTransition] = useTransition()

  function connect() {
    startTransition(async () => {
      try {
        const { url } = await startPayoutSetupAction()
        window.location.assign(url)
      } catch (err) {
        setToastTone('urgent')
        setToast((err as Error).message)
      }
    })
  }

  function withdraw() {
    startTransition(async () => {
      const r = await withdrawAction()
      if (r.ok) {
        setToastTone('ok')
        setToast(`Sent ${moneyExact(r.amountCents ?? 0)} to your account`)
      } else {
        setToastTone('urgent')
        setToast(r.error ?? 'Withdrawal failed')
      }
    })
  }

  const canWithdraw = !paused && method === 'active' && accruedCents >= PAYOUT_MIN_CENTS

  return (
    <div className="v2-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Payouts</h2>
        <StatusPill tone={payoutMethodPill.tone} label={payoutMethodPill.label} />
      </div>

      {method === 'active' ? (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {paused ? (
              <span>Withdrawals are paused on your account — please contact us.</span>
            ) : (
              <>
                {methodLabelText
                  ? `Paid out to ${methodLabelText}. `
                  : 'Your payout method is connected. '}
                {accruedCents >= PAYOUT_MIN_CENTS
                  ? 'Withdraw your accrued balance whenever you like.'
                  : `You can withdraw once your balance reaches ${moneyExact(PAYOUT_MIN_CENTS)}.`}
              </>
            )}
          </p>
          <ActionButton
            variant="primary"
            breath
            onClick={withdraw}
            disabled={pending || !canWithdraw}
            title={paused ? 'Your account is paused — withdrawals are on hold' : undefined}
          >
            {pending ? 'Sending…' : `Withdraw ${moneyExact(accruedCents)}`}
          </ActionButton>
        </>
      ) : method === 'pending' ? (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            You started setting up payouts but haven’t finished. Complete a few details with Stripe
            and you’ll be ready to withdraw.
          </p>
          <ActionButton variant="primary" breath onClick={connect} disabled={pending}>
            {pending ? 'Opening…' : 'Finish payout setup'}
          </ActionButton>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Connect a bank account or debit card with Stripe to get paid. We never see or store your
            banking details — Stripe handles it securely.
          </p>
          <ActionButton variant="primary" breath onClick={connect} disabled={pending}>
            {pending ? 'Opening…' : 'Set up payouts'}
          </ActionButton>
        </>
      )}
      {toast && <FlashToast message={toast} tone={toastTone} onDone={() => setToast(null)} />}
    </div>
  )
}
