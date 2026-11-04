'use client'

import { useEffect, useState, useTransition } from 'react'
import OnboardingFrame from '../onboarding-frame'
import { saveOnboardingPractice } from '../actions'
import { loadOnboardingState, saveOnboardingState } from '@/lib/onboarding/storage'
import { isDeploymentSkewError } from '@/lib/auth/submit-guard'
import { TONE_PILL } from '@/lib/ui/encodings'
import { ActionButton } from '@/components/ui/action-button'

const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Australia', 'Other']

/** Screen 2 of 3 — the practice: name, front-desk phone, and where patients find you. */
export default function Onboarding01() {
  const [practiceName, setPracticeName] = useState('')
  const [phone, setPhone] = useState('')
  const [street, setStreet] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [country, setCountry] = useState(COUNTRIES[0])
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Pre-fill from the sign-up form (and survive back-navigation).
  useEffect(() => {
    const draft = loadOnboardingState()
    if (draft.practiceName) setPracticeName(draft.practiceName)
    if (draft.phone) setPhone(draft.phone)
    if (draft.street) setStreet(draft.street)
    if (draft.city) setCity(draft.city)
    if (draft.state) setState(draft.state)
    if (draft.postalCode) setPostalCode(draft.postalCode)
    if (draft.country) setCountry(draft.country)
  }, [])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const value = {
      practiceName: practiceName.trim(),
      phone: phone.trim() || undefined,
      street: street.trim(),
      city: city.trim(),
      state: state.trim() || undefined,
      postalCode: postalCode.trim(),
      country,
    }
    startTransition(async () => {
      try {
        saveOnboardingState(value)
        await saveOnboardingPractice(value)
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
    <OnboardingFrame step={2}>
      <h1 className="text-3xl text-ink-900 font-bold mb-2">Tell us about your practice</h1>
      <p className="text-sm text-ink-600 mb-6">
        This becomes your website&apos;s name and how patients find you — change any of it later.
      </p>
      <form onSubmit={onSubmit}>
        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="practice-name">
              Practice name <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <input
              id="practice-name"
              className="form-input w-full"
              type="text"
              required
              placeholder="Bright Smile Dental"
              autoComplete="organization"
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
            <p className="mt-1 text-xs text-ink-500">Shown on your website so patients can call — add it anytime.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="street">
              Street address <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <input
              id="street"
              className="form-input w-full"
              type="text"
              required
              autoComplete="address-line1"
              placeholder="123 Main St"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="city">
                City <span className="text-rose-600 dark:text-rose-400">*</span>
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
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="state">
                State / region
              </label>
              <input
                id="state"
                className="form-input w-full"
                type="text"
                autoComplete="address-level1"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="postal-code">
                ZIP / postal code <span className="text-rose-600 dark:text-rose-400">*</span>
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
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="country">
                Country
              </label>
              <select
                id="country"
                className="form-select w-full"
                autoComplete="country-name"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {error && (
          <div role="alert" className={`mb-4 text-sm ${TONE_PILL.urgent} px-3 py-2 rounded`}>
            {error}
          </div>
        )}
        <div className="flex items-center justify-end">
          <ActionButton type="submit" variant="primary" pending={pending}>
            Next step →
          </ActionButton>
        </div>
      </form>
    </OnboardingFrame>
  )
}
