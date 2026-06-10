'use client'

import { useEffect, useState, useTransition } from 'react'
import OnboardingHeader from '../onboarding-header'
import OnboardingImage from '../onboarding-image'
import OnboardingProgress from '../onboarding-progress'
import { saveOnboardingStep1 } from '../actions'
import { loadOnboardingState, saveOnboardingState } from '@/lib/onboarding/storage'
import { ActionButton } from '@/components/ui/action-button'

export default function Onboarding01() {
  const [practiceName, setPracticeName] = useState('')
  const [phone, setPhone] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Pre-fill from the signup form (and survive back-navigation).
  useEffect(() => {
    const draft = loadOnboardingState()
    if (draft.practiceName) setPracticeName(draft.practiceName)
    if (draft.phone) setPhone(draft.phone)
  }, [])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        saveOnboardingState({ practiceName: practiceName.trim(), phone: phone.trim() || undefined })
        await saveOnboardingStep1({ practiceName: practiceName.trim(), phone: phone.trim() || undefined })
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
                <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">
                  Tell us about your practice
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  This becomes your website&apos;s name and the way patients see you — you can change
                  any of it later.
                </p>
                <form onSubmit={onSubmit}>
                  <div className="space-y-4 mb-8">
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="practice-name">
                        Practice name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="practice-name"
                        className="form-input w-full"
                        type="text"
                        required
                        placeholder="Bright Smile Dental"
                        value={practiceName}
                        onChange={(e) => setPracticeName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="phone">
                        Front-desk phone
                      </label>
                      <input
                        id="phone"
                        className="form-input w-full"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="(555) 123-4567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Shown on your website so patients can call — optional, add it anytime.
                      </p>
                    </div>
                  </div>
                  {error && (
                    <div className="mb-4 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded">
                      {error}
                    </div>
                  )}
                  <div className="flex items-center justify-end">
                    <ActionButton type="submit" variant="primary" disabled={pending}>
                      {pending ? 'Saving…' : 'Next step →'}
                    </ActionButton>
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
