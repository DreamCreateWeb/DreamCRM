'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import OnboardingHeader from '../onboarding-header'
import OnboardingImage from '../onboarding-image'
import OnboardingProgress from '../onboarding-progress'
import { submitOnboarding } from '../actions'
import { isDeploymentSkewError } from '@/lib/auth/submit-guard'
import { clearOnboardingState, loadOnboardingState } from '@/lib/onboarding/storage'
import { TRIAL_DAYS } from '@/lib/trial'
import { ActionButton } from '@/components/ui/action-button'

const TRIAL_PERKS = [
  'Your branded website, online booking & patient portal',
  'Patients, appointments, messaging & reviews',
  'Marketing, social, shop & integrations — everything, unlocked',
]

export default function Onboarding04() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<ReturnType<typeof loadOnboardingState>>({})

  useEffect(() => {
    setDraft(loadOnboardingState())
  }, [])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await submitOnboarding({
          practiceName: draft.practiceName,
          phone: draft.phone,
          street: draft.street,
          city: draft.city,
          state: draft.state,
          postalCode: draft.postalCode,
          country: draft.country,
          slug: draft.slug,
          brandColor: draft.brandColor,
        })
        clearOnboardingState()
        // Full reload so the freshly-set session.activeOrganizationId is visible
        // on the next request (tenant context resolution runs in the layout and
        // won't pick up a server-action-mutated session through router.push).
        window.location.assign('/onboarding-complete')
      } catch (err) {
        if (isDeploymentSkewError(err)) {
          setError('We just shipped an update — refreshing…')
          window.location.reload()
          return
        }
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
                  Start your {TRIAL_DAYS}-day free trial
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Full access to everything — no credit card required. Set up billing whenever you’re ready within the
                  next {TRIAL_DAYS} days; nothing’s charged until you do.
                </p>

                <form onSubmit={onSubmit} className="space-y-5">
                  <div className="rounded-lg border-2 border-violet-500 bg-violet-50/40 dark:bg-violet-500/10 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-violet-500" aria-hidden="true" />
                      <span className="font-semibold text-gray-800 dark:text-gray-100">
                        Everything, free for {TRIAL_DAYS} days
                      </span>
                    </div>
                    <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
                      {TRIAL_PERKS.map((perk) => (
                        <li key={perk} className="flex items-start gap-2">
                          <svg
                            className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          {perk}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {draft.practiceName && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Setting up <strong>{draft.practiceName}</strong>
                      {draft.slug ? (
                        <>
                          {' '}
                          at <strong>{draft.slug}.dreamcreatestudio.com</strong>
                        </>
                      ) : draft.city ? (
                        `, ${draft.city}`
                      ) : (
                        ''
                      )}
                    </div>
                  )}

                  {error && (
                    <div className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded">{error}</div>
                  )}

                  <ActionButton type="submit" variant="primary" disabled={pending} className="w-full">
                    {pending ? 'Setting up your clinic…' : 'Start my free trial →'}
                  </ActionButton>
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    No card required. Cancel anytime — you’re only billed if you set up billing.
                  </p>
                  <div className="text-center">
                    <Link
                      className="text-sm underline hover:no-underline text-gray-600 dark:text-gray-400"
                      href="/onboarding-03"
                    >
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
