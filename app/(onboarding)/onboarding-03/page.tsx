'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import OnboardingHeader from '../onboarding-header'
import OnboardingImage from '../onboarding-image'
import OnboardingProgress from '../onboarding-progress'
import { saveOnboardingStep3 } from '../actions'
import { saveOnboardingState } from '@/lib/onboarding/storage'

const COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Italy',
  'Spain',
  'Netherlands',
  'Japan',
  'Other',
]

export default function Onboarding03() {
  const [companyName, setCompanyName] = useState('')
  const [city, setCity] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [country, setCountry] = useState(COUNTRIES[0])
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        saveOnboardingState({
          companyName,
          city,
          postalCode,
          street: streetAddress,
          country,
        })
        await saveOnboardingStep3({ companyName, city, postalCode, streetAddress, country })
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
              <OnboardingProgress step={3} />
            </div>
            <div className="px-4 py-8">
              <div className="max-w-md mx-auto">
                <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-6">Company information</h1>
                <form onSubmit={onSubmit}>
                  <div className="space-y-4 mb-8">
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="company-name">
                        Company Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="company-name"
                        className="form-input w-full"
                        type="text"
                        required
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                      />
                    </div>
                    <div className="flex space-x-4">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1" htmlFor="city">
                          City <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="city"
                          className="form-input w-full"
                          type="text"
                          required
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1" htmlFor="postal-code">
                          Postal Code <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="postal-code"
                          className="form-input w-full"
                          type="text"
                          required
                          value={postalCode}
                          onChange={(e) => setPostalCode(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="street">
                        Street Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="street"
                        className="form-input w-full"
                        type="text"
                        required
                        value={streetAddress}
                        onChange={(e) => setStreetAddress(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="country">
                        Country <span className="text-red-500">*</span>
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
                  {error && (
                    <div className="mb-4 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{error}</div>
                  )}
                  <div className="flex items-center justify-between">
                    <Link className="text-sm underline hover:no-underline" href="/onboarding-02">&lt;- Back</Link>
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
