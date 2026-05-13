'use client'

import { useState, useEffect } from 'react'
import { PLANS, type PlanId } from '@/lib/stripe-config'

interface Subscription {
  planId: PlanId | null
  planName: string
  currentPeriodEnd: number
  cancelAtPeriodEnd: boolean
}

const colorMap: Record<string, { bar: string; dot: string; currentBtn: string; actionBtn: string }> = {
  green: {
    bar: 'bg-green-500',
    dot: 'bg-green-500',
    currentBtn: 'disabled:border-gray-200 dark:disabled:border-gray-700 disabled:bg-white dark:disabled:bg-gray-800 disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed',
    actionBtn: 'border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300',
  },
  sky: {
    bar: 'bg-sky-500',
    dot: 'bg-sky-500',
    currentBtn: 'disabled:border-gray-200 dark:disabled:border-gray-700 disabled:bg-white dark:disabled:bg-gray-800 disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed',
    actionBtn: 'bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white',
  },
  violet: {
    bar: 'bg-violet-500',
    dot: 'bg-violet-500',
    currentBtn: 'disabled:border-gray-200 dark:disabled:border-gray-700 disabled:bg-white dark:disabled:bg-gray-800 disabled:text-gray-300 dark:disabled:text-gray-600 disabled:cursor-not-allowed',
    actionBtn: 'bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white',
  },
}

export default function PlansPanel() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/billing/subscription')
      .then((r) => r.json())
      .then((data) => setSubscription(data.subscription ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSelectPlan(planId: PlanId) {
    setCheckoutLoading(planId)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, interval: 'month' }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error ?? 'Something went wrong')
      }
    } catch {
      alert('Could not connect to billing service')
    } finally {
      setCheckoutLoading(null)
    }
  }

  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd * 1000).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : null

  const currentPlanIndex = PLANS.findIndex((p) => p.id === subscription?.planId)

  return (
    <div className="grow">
      <div className="p-6 space-y-6">

        {/* Header */}
        <section>
          <div className="mb-8">
            <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-4">Plans</h2>
            {loading ? (
              <div className="text-sm text-gray-400">Loading subscription…</div>
            ) : subscription ? (
              <div className="text-sm">
                Your <strong className="font-medium">{subscription.planName} Plan</strong> renews on{' '}
                <strong className="font-medium">{renewalDate}</strong>.
                {subscription.cancelAtPeriodEnd && (
                  <span className="ml-2 text-red-500">(Cancels at period end)</span>
                )}
              </div>
            ) : (
              <div className="text-sm">Choose a plan to get your clinic online with Dream Create.</div>
            )}
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-12 gap-6">
            {PLANS.map((plan, planIndex) => {
              const isCurrent = subscription?.planId === plan.id
              const colors = colorMap[plan.color] ?? colorMap.violet
              const isLoading = checkoutLoading === plan.id
              const isDowngrade = currentPlanIndex >= 0 && planIndex < currentPlanIndex

              return (
                <div
                  key={plan.id}
                  className="relative col-span-full xl:col-span-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 shadow-sm rounded-b-lg"
                >
                  <div className={`absolute top-0 left-0 right-0 h-0.5 ${colors.bar}`} aria-hidden="true" />
                  <div className="px-5 pt-5 pb-6 border-b border-gray-200 dark:border-gray-700/60">
                    <header className="flex items-center mb-2">
                      <div className={`w-6 h-6 rounded-full shrink-0 ${colors.dot} mr-3`}>
                        <svg className="w-6 h-6 fill-current text-white" viewBox="0 0 24 24">
                          <path d="M12 17a.833.833 0 01-.833-.833 3.333 3.333 0 00-3.334-3.334.833.833 0 110-1.666 3.333 3.333 0 003.334-3.334.833.833 0 111.666 0 3.333 3.333 0 003.334 3.334.833.833 0 110 1.666 3.333 3.333 0 00-3.334 3.334c0 .46-.373.833-.833.833z" />
                        </svg>
                      </div>
                      <h3 className="text-lg text-gray-800 dark:text-gray-100 font-semibold">{plan.name}</h3>
                    </header>
                    <div className="text-gray-800 dark:text-gray-100 font-bold mb-4">
                      <span className="text-2xl">$</span>
                      <span className="text-3xl">{plan.price}</span>
                      <span className="text-gray-500 font-medium text-sm">/mo</span>
                    </div>
                    {isCurrent ? (
                      <button className={`btn w-full bg-gray-900 text-gray-100 ${colors.currentBtn}`} disabled>
                        <svg className="w-3 h-3 shrink-0 fill-current mr-2" viewBox="0 0 12 12">
                          <path d="M10.28 1.28L3.989 7.575 1.695 5.28A1 1 0 00.28 6.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 1.28z" />
                        </svg>
                        Current Plan
                      </button>
                    ) : (
                      <button
                        className={`btn w-full ${colors.actionBtn} disabled:opacity-60 disabled:cursor-not-allowed`}
                        onClick={() => handleSelectPlan(plan.id)}
                        disabled={isLoading}
                      >
                        {isLoading ? 'Redirecting…' : isDowngrade ? 'Downgrade' : subscription?.planId ? 'Upgrade' : 'Get Started'}
                      </button>
                    )}
                  </div>
                  <div className="px-5 pt-4 pb-5">
                    <div className="text-xs text-gray-800 dark:text-gray-100 font-semibold uppercase mb-4">What's included</div>
                    <ul>
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center py-1">
                          <svg className="w-3 h-3 shrink-0 fill-current text-green-500 mr-2" viewBox="0 0 12 12">
                            <path d="M10.28 1.28L3.989 7.575 1.695 5.28A1 1 0 00.28 6.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 1.28z" />
                          </svg>
                          <div className="text-sm">{feature}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Contact Sales */}
        <section>
          <div className="px-5 py-3 bg-linear-to-r from-violet-500/[0.12] dark:from-violet-500/[0.24] to-violet-500/[0.04] rounded-lg text-center xl:text-left xl:flex xl:flex-wrap xl:justify-between xl:items-center">
            <div className="text-gray-800 dark:text-gray-100 font-semibold mb-2 xl:mb-0">Need something custom for a larger clinic network?</div>
            <a
              href="mailto:contact@dreamcreateweb.com"
              className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
            >
              Contact Sales
            </a>
          </div>
        </section>

        {/* FAQs */}
        <section>
          <div className="my-8">
            <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold">FAQs</h2>
          </div>
          <ul className="space-y-5">
            <li>
              <div className="font-semibold text-gray-800 dark:text-gray-100 mb-1">What's the difference between Basic and Pro?</div>
              <div className="text-sm">Basic gives your clinic a clean, professional static website with no backend. Pro adds an admin portal so your front desk can log in, manage the clinic, and view analytics — all in one place.</div>
            </li>
            <li>
              <div className="font-semibold text-gray-800 dark:text-gray-100 mb-1">What does Premium include that Pro doesn't?</div>
              <div className="text-sm">Premium adds a patient portal so patients can log in, access records, and book appointments. It also includes SEO optimization, blog post management, and priority support. We're continuing to build out the Premium feature set.</div>
            </li>
            <li>
              <div className="font-semibold text-gray-800 dark:text-gray-100 mb-1">Can I switch plans?</div>
              <div className="text-sm">Yes — upgrade or downgrade anytime. Upgrades take effect immediately; downgrades at the end of your billing period. <a className="font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400" href="mailto:contact@dreamcreateweb.com">Contact us</a> with any questions.</div>
            </li>
          </ul>
        </section>

      </div>
    </div>
  )
}
