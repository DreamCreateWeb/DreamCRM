'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import OnboardingHeader from '../onboarding-header'
import OnboardingImage from '../onboarding-image'
import OnboardingProgress from '../onboarding-progress'
import { saveOnboardingStep2 } from '../actions'
import { loadOnboardingState, saveOnboardingState } from '@/lib/onboarding/storage'
import { ActionButton } from '@/components/ui/action-button'

const COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Australia',
  'Other',
]

export default function Onboarding02() {
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState(COUNTRIES[0])
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const draft = loadOnboardingState()
    if (draft.street) setStreet(draft.street)
    if (draft.city) setCity(draft.city)
    if (draft.state) setState(draft.state)
    if (draft.postalCode) setPostalCode(draft.postalCode)
    if (draft.country) setCountry(draft.country)
  }, [])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        saveOnboardingState({
          street: street.trim(),
          city: city.trim(),
          state: state.trim() || undefined,
          postalCode: postalCode.trim(),
          country,
        })
        await saveOnboardingStep2({
          street: street.trim(),
          city: city.trim(),
          state: state.trim() || undefined,
          postalCode: postalCode.trim(),
          country,
        })
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
              <OnboardingProgress step={2} />
            </div>
            <div className="px-4 py-8">
              <div className="max-w-md mx-auto">
                <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">
                  Where do patients find you?
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Your address goes on your website, your Google listing data, and directions links.
                </p>
                <form onSubmit={onSubmit}>
                  <div className="space-y-4 mb-8">
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="street">
                        Street address <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="street"
                        className="form-input w-full"
                        type="text"
                        required
                        autoComplete="street-address"
                        placeholder="123 Main Street, Suite 200"
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                      />
                    </div>
                    <div className="flex space-x-4">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1" htmlFor="city">
                          City <span className="text-rose-500">*</span>
                        </label>
                        <input
                          id="city"
                          className="form-input w-full"
                          type="text"
                          required
                          autoComplete="address-level2"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                        />
                      </div>
                      <div className="w-28">
                        <label className="block text-sm font-medium mb-1" htmlFor="state">
                          State
                        </label>
                        <input
                          id="state"
                          className="form-input w-full"
                          type="text"
                          autoComplete="address-level1"
                          placeholder="TX"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex space-x-4">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1" htmlFor="postal-code">
                          ZIP / Postal code <span className="text-rose-500">*</span>
                        </label>
                        <input
                          id="postal-code"
                          className="form-input w-full"
                          type="text"
                          required
                          autoComplete="postal-code"
                          value={postalCode}
                          onChange={(e) => setPostalCode(e.target.value)}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1" htmlFor="country">
                          Country <span className="text-rose-500">*</span>
                        </label>
                        <select
                          id="country"
                          className="form-select w-full"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                        >
                          {COUNTRIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  {error && (
                    <div className="mb-4 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded">{error}</div>
                  )}
                  <div className="flex items-center justify-between">
                    <Link className="text-sm underline hover:no-underline text-gray-600 dark:text-gray-400" href="/onboarding-01">
                      ← Back
                    </Link>
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
