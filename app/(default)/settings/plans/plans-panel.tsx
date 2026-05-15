'use client'

import { useState, useTransition } from 'react'
import { changePlan } from '../actions'
import { formatMoney } from '@/lib/utils'

type PlanKey = 'free' | 'pro' | 'team' | 'enterprise'

const PLANS: { key: PlanKey; name: string; description: string; monthly: number; features: string[]; accent: string }[] = [
  {
    key: 'free',
    name: 'Free',
    description: 'Try DreamCRM. Best for getting started.',
    monthly: 0,
    features: ['Up to 3 users', '500 contacts', 'Community support'],
    accent: 'green',
  },
  {
    key: 'pro',
    name: 'Pro',
    description: 'For growing teams who need automation.',
    monthly: 1900,
    features: ['Up to 10 users', '10k contacts', 'Email & API integrations', 'Priority support'],
    accent: 'violet',
  },
  {
    key: 'team',
    name: 'Team',
    description: 'For established organizations.',
    monthly: 4900,
    features: ['Unlimited users', '100k contacts', 'SSO + audit log', 'Dedicated CSM'],
    accent: 'sky',
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    description: 'Custom contracts and security review.',
    monthly: 19900,
    features: ['Custom limits', 'SLA + uptime guarantees', 'On-prem deployment options'],
    accent: 'amber',
  },
]

const ANNUAL_DISCOUNT = 0.2

export default function PlansPanel({ currentPlan }: { currentPlan: PlanKey }) {
  const [annual, setAnnual] = useState(true)
  const [pending, startTransition] = useTransition()
  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null)
  const [feedback, setFeedback] = useState<{ ok?: string; error?: string } | null>(null)

  function handleSelect(plan: PlanKey) {
    if (plan === currentPlan || pending) return
    setPendingPlan(plan)
    setFeedback(null)
    startTransition(async () => {
      try {
        await changePlan(plan)
        setFeedback({ ok: `Switched to the ${plan} plan.` })
      } catch (err) {
        setFeedback({ error: (err as Error).message })
      } finally {
        setPendingPlan(null)
      }
    })
  }

  function effective(monthly: number) {
    return Math.round(annual ? monthly * (1 - ANNUAL_DISCOUNT) : monthly)
  }

  return (
    <div className="grow">
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-4">Plans</h2>
          <div className="text-sm">
            You&apos;re currently on the <strong className="font-medium capitalize">{currentPlan}</strong> plan.
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-sm text-gray-500 font-medium">Monthly</div>
          <div className="form-switch">
            <input type="checkbox" id="plan-toggle" className="sr-only" checked={annual} onChange={() => setAnnual(!annual)} />
            <label htmlFor="plan-toggle">
              <span className="bg-white shadow-sm" aria-hidden="true"></span>
              <span className="sr-only">Pay annually</span>
            </label>
          </div>
          <div className="text-sm text-gray-500 font-medium">Annually <span className="text-green-500">(-20%)</span></div>
        </div>

        {feedback?.error && (
          <div className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{feedback.error}</div>
        )}
        {feedback?.ok && (
          <div className="text-sm text-green-700 bg-green-50 dark:bg-green-500/10 px-3 py-2 rounded">{feedback.ok}</div>
        )}

        <div className="grid grid-cols-12 gap-6">
          {PLANS.map((p) => {
            const isCurrent = p.key === currentPlan
            const isPending = pendingPlan === p.key
            return (
              <div
                key={p.key}
                className="relative col-span-full sm:col-span-6 xl:col-span-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 shadow-sm rounded-b-lg"
              >
                <div className={`absolute top-0 left-0 right-0 h-0.5 bg-${p.accent}-500`} aria-hidden="true"></div>
                <div className="px-5 pt-5 pb-6 border-b border-gray-200 dark:border-gray-700/60">
                  <header className="flex items-center mb-2">
                    <div className={`w-6 h-6 rounded-full shrink-0 bg-${p.accent}-500 mr-3`} />
                    <h3 className="text-lg text-gray-800 dark:text-gray-100 font-semibold">{p.name}</h3>
                  </header>
                  <div className="text-sm mb-2">{p.description}</div>
                  <div className="text-gray-800 dark:text-gray-100 font-bold mb-4">
                    <span className="text-2xl">{formatMoney(effective(p.monthly))[0]}</span>
                    <span className="text-3xl">{formatMoney(effective(p.monthly)).slice(1)}</span>
                    <span className="text-gray-500 font-medium text-sm">/mo</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelect(p.key)}
                    disabled={isCurrent || pending}
                    className={`btn w-full ${
                      isCurrent
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 cursor-default'
                        : 'bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white'
                    } disabled:opacity-60`}
                  >
                    {isPending ? 'Switching…' : isCurrent ? 'Current plan' : `Switch to ${p.name}`}
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
