'use client'

import { useState, useTransition } from 'react'
import OnboardingHeader from '../onboarding-header'
import OnboardingImage from '../onboarding-image'
import OnboardingProgress from '../onboarding-progress'
import { saveOnboardingStep1 } from '../actions'
import { saveOnboardingState } from '@/lib/onboarding/storage'

type Choice = 'company' | 'freelance' | 'starting'

const OPTIONS: { value: Choice; label: string }[] = [
  { value: 'company', label: 'I have a company' },
  { value: 'freelance', label: "I'm a freelance / contractor" },
  { value: 'starting', label: "I'm just getting started" },
]

export default function Onboarding01() {
  const [choice, setChoice] = useState<Choice>('company')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        saveOnboardingState({ situation: choice })
        await saveOnboardingStep1({ accountType: choice })
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
              <OnboardingProgress step={1} />
            </div>

            <div className="px-4 py-8">
              <div className="max-w-md mx-auto">
                <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-6">
                  Tell us what&apos;s your situation
                </h1>
                <form onSubmit={onSubmit}>
                  <div className="space-y-3 mb-8">
                    {OPTIONS.map((opt) => (
                      <label key={opt.value} className="relative block cursor-pointer">
                        <input
                          type="radio"
                          name="account-type"
                          value={opt.value}
                          className="peer sr-only"
                          checked={choice === opt.value}
                          onChange={() => setChoice(opt.value)}
                        />
                        <div className="flex items-center bg-white text-sm font-medium text-gray-800 dark:text-gray-100 p-4 rounded-lg dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm transition">
                          <svg className="w-6 h-6 shrink-0 fill-current mr-4" viewBox="0 0 24 24">
                            <path className="text-violet-500" d="m12 10.856 9-5-8.514-4.73a1 1 0 0 0-.972 0L3 5.856l9 5Z" />
                            <path className="text-violet-300" d="m11 12.588-9-5V18a1 1 0 0 0 .514.874L11 23.588v-11Z" />
                            <path className="text-violet-200" d="M13 12.588v11l8.486-4.714A1 1 0 0 0 22 18V7.589l-9 4.999Z" />
                          </svg>
                          <span>{opt.label}</span>
                        </div>
                        <div className="absolute inset-0 border-2 border-transparent peer-checked:border-violet-400 dark:peer-checked:border-violet-500 rounded-lg pointer-events-none" aria-hidden="true"></div>
                      </label>
                    ))}
                  </div>
                  {error && (
                    <div className="mb-4 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">
                      {error}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <button
                      type="submit"
                      disabled={pending}
                      className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white ml-auto disabled:opacity-60"
                    >
                      {pending ? 'Saving…' : 'Next Step ->'}
                    </button>
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
