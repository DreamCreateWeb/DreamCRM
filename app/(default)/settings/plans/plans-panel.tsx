'use client'

import { useState, useTransition } from 'react'
import { openBillingPortal, startStripeCheckout } from '../actions'
import { PLANS, type BillingInterval, type PlanId } from '@/lib/stripe-config'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { subscriptionStatusMeta } from '@/lib/billing-status'

interface Props {
  /** The clinic's real plan tier (from clinic_profile via tenant context). */
  currentPlanId: PlanId
  /** Raw Stripe subscription status — drives the status pill / dunning copy. */
  subscriptionStatus: string | null
  /** The interval the live subscription bills on, if known. */
  currentInterval: BillingInterval | null
  /** When arriving via requirePlan's redirect, the gated module's label. */
  upgradeModuleLabel: string | null
}

export default function PlansPanel({
  currentPlanId,
  subscriptionStatus,
  currentInterval,
  upgradeModuleLabel,
}: Props) {
  const [interval, setInterval] = useState<BillingInterval>(currentInterval ?? 'monthly')
  const [pending, startTransition] = useTransition()
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null)
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string } | null>(null)

  const currentPlan = PLANS.find((p) => p.id === currentPlanId)
  const status = subscriptionStatusMeta(subscriptionStatus)
  // A subscription that isn't active/trialing means switching plans should go
  // through the portal (fix the card first), not start a fresh checkout.
  const billingBroken = status.severity === 'urgent' || status.severity === 'warn'

  function handleSelect(planId: PlanId) {
    if (planId === currentPlanId || pending) return
    setPendingPlan(planId)
    setFeedback(null)
    startTransition(async () => {
      try {
        await startStripeCheckout(planId, interval)
        // startStripeCheckout redirects, so this line is rarely reached.
      } catch (err) {
        setFeedback({ error: (err as Error).message })
        setPendingPlan(null)
      }
    })
  }

  function handlePortal() {
    setFeedback(null)
    startTransition(async () => {
      try {
        await openBillingPortal()
      } catch (err) {
        setFeedback({ error: (err as Error).message })
      }
    })
  }

  function priceFor(plan: (typeof PLANS)[number]) {
    return interval === 'annual' ? plan.annualPrice : plan.price
  }

  return (
    <div className="grow">
      <div className="p-6 space-y-6">
        {upgradeModuleLabel && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
            <span className="font-semibold">{upgradeModuleLabel} is on a higher plan.</span>{' '}
            Pick a plan below to unlock it — your current data stays exactly as it is.
          </div>
        )}

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-3">Plans</h2>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <span>
                You&apos;re currently on the{' '}
                <strong className="font-medium capitalize text-gray-800 dark:text-gray-100">
                  {currentPlan?.name ?? currentPlanId}
                </strong>{' '}
                plan.
              </span>
              {status.label && <StatusPill tone={status.tone} label={status.label} title={status.description} />}
            </div>
            {billingBroken && (
              <div className="mt-1 text-sm text-rose-700 dark:text-rose-300">
                {status.description} Update your card in the billing portal to keep your features.
              </div>
            )}
          </div>
          <ActionButton variant="secondary" size="sm" onClick={handlePortal} disabled={pending}>
            Manage billing →
          </ActionButton>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">Monthly</div>
          <div className="form-switch">
            <input
              type="checkbox"
              id="plan-toggle"
              className="sr-only"
              checked={interval === 'annual'}
              onChange={() => setInterval(interval === 'annual' ? 'monthly' : 'annual')}
            />
            <label htmlFor="plan-toggle">
              <span className="bg-white shadow-sm" aria-hidden="true"></span>
              <span className="sr-only">Pay annually</span>
            </label>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            Annually <span className="text-emerald-600 dark:text-emerald-400">(2 months free)</span>
          </div>
        </div>

        {feedback?.error && (
          <div className="text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded">{feedback.error}</div>
        )}
        {feedback?.ok && (
          <div className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-3 py-2 rounded">{feedback.ok}</div>
        )}

        <div className="grid grid-cols-12 gap-6">
          {PLANS.map((p) => {
            const isCurrent = p.id === currentPlanId
            const isPending = pendingPlan === p.id
            const displayed = priceFor(p)
            const monthlyEquivalent = interval === 'annual' ? Math.round(p.annualPrice / 12) : p.price
            return (
              <div
                key={p.id}
                className="relative col-span-full sm:col-span-6 xl:col-span-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 shadow-sm rounded-b-lg"
              >
                <div className={`absolute top-0 left-0 right-0 h-0.5 bg-${p.color}-500`} aria-hidden="true"></div>
                <div className="px-5 pt-5 pb-6 border-b border-gray-200 dark:border-gray-700/60">
                  <header className="flex items-center gap-3 mb-2">
                    <div className={`w-6 h-6 rounded-full shrink-0 bg-${p.color}-500`} aria-hidden="true" />
                    <h3 className="text-lg text-gray-800 dark:text-gray-100 font-semibold">{p.name}</h3>
                    {isCurrent && <StatusPill tone="special" label="Current plan" className="ml-auto" />}
                  </header>
                  <div className="text-gray-800 dark:text-gray-100 font-bold mb-1 tabular-nums">
                    <span className="text-2xl">$</span>
                    <span className="text-3xl">{displayed}</span>
                    <span className="text-gray-500 dark:text-gray-400 font-medium text-sm">/{interval === 'annual' ? 'yr' : 'mo'}</span>
                  </div>
                  {interval === 'annual' && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-3 tabular-nums">${monthlyEquivalent}/mo billed annually</div>
                  )}
                  {isCurrent ? (
                    <div className="btn w-full mt-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-default">
                      Current plan
                    </div>
                  ) : billingBroken ? (
                    <ActionButton
                      variant="primary"
                      onClick={handlePortal}
                      disabled={pending}
                      className="w-full mt-3 justify-center"
                    >
                      Fix billing to switch
                    </ActionButton>
                  ) : (
                    <ActionButton
                      variant="primary"
                      onClick={() => handleSelect(p.id)}
                      disabled={pending}
                      className="w-full mt-3 justify-center"
                    >
                      {isPending ? 'Redirecting…' : `Switch to ${p.name}`}
                    </ActionButton>
                  )}
                </div>
                <div className="px-5 pt-4 pb-5">
                  <div className="text-xs text-gray-800 dark:text-gray-100 font-semibold uppercase mb-4">What&apos;s included</div>
                  <ul>
                    {p.features.map((f) => (
                      <li key={f} className="flex items-center py-1">
                        <svg className="w-3 h-3 fill-current text-emerald-500 mr-2 shrink-0" viewBox="0 0 12 12" aria-hidden="true">
                          <path d="M10.28 1.28L3.989 7.575 1.695 5.28A1 1 0 00.28 6.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 1.28z" />
                        </svg>
                        <span className="text-sm text-gray-700 dark:text-gray-200">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
