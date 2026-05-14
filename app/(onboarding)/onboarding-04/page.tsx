'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import OnboardingHeader from '../onboarding-header'
import OnboardingImage from '../onboarding-image'
import OnboardingProgress from '../onboarding-progress'
import { loadOnboardingState } from '@/lib/onboarding/storage'
import { submitOnboarding } from '../actions'
import { PLANS, type PlanId } from '@/lib/stripe-config'

const COLOR_BAR: Record<string, string> = { green: 'bg-green-500', sky: 'bg-sky-500', violet: 'bg-violet-500' }
const COLOR_DOT: Record<string, string> = { green: 'bg-green-500', sky: 'bg-sky-500', violet: 'bg-violet-500' }

export default function Onboarding04() {
  const router = useRouter()
  const [selected, setSelected] = useState<PlanId>('pro')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    try {
      const state = loadOnboardingState()
      const res = await submitOnboarding({ ...state, planId: selected })
      if (res.url) {
        window.location.href = res.url
      } else {
        router.push('/dashboard')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <main className="bg-white dark:bg-gray-900">
      <div className="relative flex">
        <div className="w-full md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col after:flex-1">

            <div className="flex-1">
              <OnboardingHeader />
              <OnboardingProgress step={4} />
            </div>

            <div className="px-4 py-8">
              <div className="max-w-md mx-auto">
                <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">Choose a plan</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  You'll continue to a secure Stripe checkout. Switch plans any time from settings.
                </p>

                <div className="space-y-3 mb-6">
                  {PLANS.map((plan) => {
                    const isSelected = selected === plan.id
                    return (
                      <label key={plan.id} className="relative block cursor-pointer">
                        <input
                          type="radio"
                          name="plan"
                          value={plan.id}
                          checked={isSelected}
                          onChange={() => setSelected(plan.id)}
                          className="peer sr-only"
                        />
                        <div className="relative bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm transition">
                          <div className={`absolute top-0 left-0 right-0 h-0.5 rounded-t-lg ${COLOR_BAR[plan.color] ?? 'bg-violet-500'}`} aria-hidden="true" />
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center">
                              <span className={`w-2.5 h-2.5 rounded-full mr-2 ${COLOR_DOT[plan.color] ?? 'bg-violet-500'}`} />
                              <span className="font-semibold text-gray-800 dark:text-gray-100">{plan.name}</span>
                            </div>
                            <div className="text-gray-800 dark:text-gray-100 font-bold tabular-nums">
                              <span className="text-lg">${plan.price}</span>
                              <span className="text-xs text-gray-500 font-medium">/mo</span>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{plan.features[0]}</div>
                        </div>
                        <div className="absolute inset-0 border-2 border-transparent peer-checked:border-violet-400 dark:peer-checked:border-violet-500 rounded-lg pointer-events-none" aria-hidden="true" />
                      </label>
                    )
                  })}
                </div>

                {error && (
                  <div className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <Link className="text-sm underline hover:no-underline" href="/onboarding-03">&lt;- Back</Link>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white ml-auto disabled:opacity-60"
                  >
                    {loading ? 'Redirecting…' : 'Continue to Checkout →'}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

        <OnboardingImage />
      </div>
    </main>
  )
}
