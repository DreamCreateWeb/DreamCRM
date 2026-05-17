'use client'

import { useState, useTransition } from 'react'
import { openBillingPortal, startStripeCheckout } from '../actions'
import { PLANS, type BillingInterval, type PlanId } from '@/lib/stripe-config'

type PlanKey = 'free' | 'pro' | 'team' | 'enterprise'

// Mapping between local billing_plan enum and the customer-facing PlanId.
const PLAN_KEY_TO_ID: Partial<Record<PlanKey, PlanId>> = {
  pro: 'pro',
  team: 'premium',
}
const PLAN_ID_TO_KEY: Record<PlanId, PlanKey> = {
  basic: 'free',
  pro: 'pro',
  premium: 'team',
}

export default function PlansPanel({ currentPlan }: { currentPlan: PlanKey }) {
  const [interval, setInterval] = useState<BillingInterval>('monthly')
  const [pending, startTransition] = useTransition()
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null)
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string } | null>(null)

  const currentPlanId = (Object.entries(PLAN_ID_TO_KEY).find(([, k]) => k === currentPlan)?.[0] ?? null) as
    | PlanId
    | null

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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-4">Plans</h2>
            <div className="text-sm">
              You&apos;re currently on the{' '}
              <strong className="font-medium capitalize">
                {currentPlanId ?? 'free'}
              </strong>{' '}
              plan.
            </div>
          </div>
          {currentPlanId && (
            <button
              type="button"
              onClick={handlePortal}
              disabled={pending}
              className="btn-sm border border-gray-200 dark:border-gray-700/60 text-gray-800 dark:text-gray-300 disabled:opacity-60"
            >
              Manage billing →
            </button>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-sm text-gray-500 font-medium">Monthly</div>
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
          <div className="text-sm text-gray-500 font-medium">
            Annually <span className="text-green-500">(2 months free)</span>
          </div>
        </div>

        {feedback?.error && (
          <div className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{feedback.error}</div>
        )}
        {feedback?.ok && (
          <div className="text-sm text-green-700 bg-green-50 dark:bg-green-500/10 px-3 py-2 rounded">{feedback.ok}</div>
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
                  <header className="flex items-center mb-2">
                    <div className={`w-6 h-6 rounded-full shrink-0 bg-${p.color}-500 mr-3`} />
                    <h3 className="text-lg text-gray-800 dark:text-gray-100 font-semibold">{p.name}</h3>
                  </header>
                  <div className="text-gray-800 dark:text-gray-100 font-bold mb-1">
                    <span className="text-2xl">$</span>
                    <span className="text-3xl">{displayed}</span>
                    <span className="text-gray-500 font-medium text-sm">/{interval === 'annual' ? 'yr' : 'mo'}</span>
                  </div>
                  {interval === 'annual' && (
                    <div className="text-xs text-gray-500 mb-3">${monthlyEquivalent}/mo billed annually</div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSelect(p.id)}
                    disabled={isCurrent || pending}
                    className={`btn w-full mt-3 ${
                      isCurrent
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 cursor-default'
                        : 'bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white'
                    } disabled:opacity-60`}
                  >
                    {isPending ? 'Redirecting…' : isCurrent ? 'Current plan' : `Switch to ${p.name}`}
                  </button>
                </div>
                <div className="px-5 pt-4 pb-5">
                  <div className="text-xs text-gray-800 dark:text-gray-100 font-semibold uppercase mb-4">What&apos;s included</div>
                  <ul>
                    {p.features.map((f) => (
                      <li key={f} className="flex items-center py-1">
                        <svg className="w-3 h-3 fill-current text-green-500 mr-2 shrink-0" viewBox="0 0 12 12">
                          <path d="M10.28 1.28L3.989 7.575 1.695 5.28A1 1 0 00.28 6.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 1.28z" />
                        </svg>
                        <span className="text-sm">{f}</span>
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
