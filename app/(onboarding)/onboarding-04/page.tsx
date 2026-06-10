'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import OnboardingHeader from '../onboarding-header'
import OnboardingImage from '../onboarding-image'
import OnboardingProgress from '../onboarding-progress'
import { submitOnboarding } from '../actions'
import { clearOnboardingState, loadOnboardingState } from '@/lib/onboarding/storage'
import { PLANS, type BillingInterval, type PlanId } from '@/lib/stripe-config'
import { ActionButton } from '@/components/ui/action-button'

export default function Onboarding04() {
  const [planId, setPlanId] = useState<PlanId>('pro')
  const [interval, setInterval] = useState<BillingInterval>('monthly')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<ReturnType<typeof loadOnboardingState>>({})

  useEffect(() => {
    const loaded = loadOnboardingState()
    setDraft(loaded)
    // Honor the plan they picked on the marketing /pricing page.
    if (loaded.planId) setPlanId(loaded.planId)
    if (loaded.interval) setInterval(loaded.interval)
  }, [])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const { url } = await submitOnboarding({
          practiceName: draft.practiceName,
          phone: draft.phone,
          street: draft.street,
          city: draft.city,
          state: draft.state,
          postalCode: draft.postalCode,
          country: draft.country,
          slug: draft.slug,
          brandColor: draft.brandColor,
          planId,
          interval,
        })
        clearOnboardingState()
        if (url) {
          window.location.href = url
        } else {
          // Full reload so the freshly-set session.activeOrganizationId is
          // visible on the next request (tenant context resolution runs in
          // the layout and won't pick up a server-action-mutated session
          // through router.push alone).
          window.location.assign('/')
        }
      } catch (err) {
        setError((err as Error).message)
      }
    })
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
                <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">
                  Pick your plan
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Month-to-month, no contract — switch or cancel anytime in Settings.
                </p>

                <form onSubmit={onSubmit} className="space-y-4">
                  <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Billing</span>
                    <div className="flex gap-2">
                      {(['monthly', 'annual'] as const).map((iv) => (
                        <button
                          key={iv}
                          type="button"
                          onClick={() => setInterval(iv)}
                          aria-pressed={interval === iv}
                          className={`px-3 py-1 rounded text-sm font-medium transition ${
                            interval === iv
                              ? 'bg-gray-900 text-gray-100 dark:bg-gray-100 dark:text-gray-800'
                              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
                          }`}
                        >
                          {iv === 'monthly' ? 'Monthly' : 'Annual (2 mo free)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {PLANS.map((p) => {
                      const selected = planId === p.id
                      const price = interval === 'annual' ? p.annualPrice : p.price
                      const suffix = interval === 'annual' ? '/yr' : '/mo'
                      return (
                        <label
                          key={p.id}
                          className={`relative block cursor-pointer rounded-lg border-2 p-4 transition ${
                            selected
                              ? 'border-violet-500 bg-violet-50/40 dark:bg-violet-500/10'
                              : 'border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
                          <input
                            type="radio"
                            name="plan"
                            value={p.id}
                            checked={selected}
                            onChange={() => setPlanId(p.id)}
                            className="sr-only"
                          />
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`w-2 h-2 rounded-full bg-${p.color}-500`} aria-hidden="true" />
                                <span className="font-semibold text-gray-800 dark:text-gray-100">{p.name}</span>
                              </div>
                              <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5 mt-2">
                                {p.features.slice(0, 3).map((f) => (
                                  <li key={f}>• {f}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="text-right">
                              <div className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                ${price.toLocaleString('en-US')}
                                <span className="text-xs font-normal text-gray-500">{suffix}</span>
                              </div>
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  {draft.practiceName && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Setting up <strong>{draft.practiceName}</strong>
                      {draft.slug ? (
                        <>
                          {' '}at <strong>{draft.slug}.dreamcreatestudio.com</strong>
                        </>
                      ) : draft.city ? `, ${draft.city}` : ''}
                    </div>
                  )}

                  {error && (
                    <div className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded">{error}</div>
                  )}

                  <ActionButton type="submit" variant="primary" disabled={pending} className="w-full">
                    {pending ? 'Setting up…' : 'Continue to checkout →'}
                  </ActionButton>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    Have a promo or partner code? You can apply it on the checkout page.
                  </p>
                  <div className="text-center">
                    <Link className="text-sm underline hover:no-underline text-gray-600 dark:text-gray-400" href="/onboarding-03">
                      ← Back
                    </Link>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
        <OnboardingImage />
      </div>
    </main>
  )
}
