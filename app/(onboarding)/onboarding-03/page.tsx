'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import OnboardingHeader from '../onboarding-header'
import OnboardingImage from '../onboarding-image'
import OnboardingProgress from '../onboarding-progress'
import { loadOnboardingState, saveOnboardingState } from '@/lib/onboarding/storage'

export default function Onboarding03() {
  const router = useRouter()
  const [companyName, setCompanyName] = useState('')
  const [city, setCity] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [street, setStreet] = useState('')
  const [country, setCountry] = useState('US')

  useEffect(() => {
    const s = loadOnboardingState()
    if (s.companyName) setCompanyName(s.companyName)
    if (s.city) setCity(s.city)
    if (s.postalCode) setPostalCode(s.postalCode)
    if (s.street) setStreet(s.street)
    if (s.country) setCountry(s.country)
  }, [])

  function handleNext(e: React.FormEvent) {
    e.preventDefault()
    saveOnboardingState({ companyName, city, postalCode, street, country })
    router.push('/onboarding-04')
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
                <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-6">Clinic information</h1>
                <form onSubmit={handleNext}>
                  <div className="space-y-4 mb-8">
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="company-name">
                        Clinic Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="company-name"
                        className="form-input w-full"
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex space-x-4">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1" htmlFor="city">City</label>
                        <input id="city" className="form-input w-full" type="text" value={city} onChange={(e) => setCity(e.target.value)} />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1" htmlFor="postal-code">Postal Code</label>
                        <input id="postal-code" className="form-input w-full" type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="street">Street Address</label>
                      <input id="street" className="form-input w-full" type="text" value={street} onChange={(e) => setStreet(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" htmlFor="country">Country</label>
                      <select id="country" className="form-select w-full" value={country} onChange={(e) => setCountry(e.target.value)}>
                        <option value="US">United States</option>
                        <option value="CA">Canada</option>
                        <option value="GB">United Kingdom</option>
                        <option value="AU">Australia</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Link className="text-sm underline hover:no-underline" href="/onboarding-02">&lt;- Back</Link>
                    <button type="submit" className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white ml-auto">
                      Next Step →
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
