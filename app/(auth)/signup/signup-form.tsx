'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signUp } from '@/lib/auth-client'
import { saveOnboardingState } from '@/lib/onboarding/storage'
import { PLANS, type BillingInterval, type PlanId } from '@/lib/stripe-config'
import { ActionButton } from '@/components/ui/action-button'

const SIGN_UP_TIMEOUT_MS = 25_000

function isPlanId(v: string | null): v is PlanId {
  return v === 'basic' || v === 'pro' || v === 'premium'
}
function isInterval(v: string | null): v is BillingInterval {
  return v === 'monthly' || v === 'annual'
}

export default function SignUpForm() {
  const params = useSearchParams()
  const pickedPlanId = isPlanId(params.get('plan')) ? (params.get('plan') as PlanId) : null
  const pickedInterval = isInterval(params.get('interval')) ? (params.get('interval') as BillingInterval) : null
  const pickedPlan = pickedPlanId ? PLANS.find((p) => p.id === pickedPlanId) : null

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [practiceName, setPracticeName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const timeout = new Promise<{ timedOut: true }>((resolve) =>
      setTimeout(() => resolve({ timedOut: true }), SIGN_UP_TIMEOUT_MS),
    )

    try {
      const result = await Promise.race([
        signUp.email({ email, password, name }).then((r) => ({ ...r, timedOut: false as const })),
        timeout,
      ])

      if ('timedOut' in result && result.timedOut) {
        setError('Sign-up is taking longer than expected. Try again in a moment.')
        setLoading(false)
        return
      }

      const { error: signUpError } = result as { error?: { message?: string } | null }
      if (signUpError) {
        setError(signUpError.message ?? 'Unable to create account')
        setLoading(false)
        return
      }

      // Seed the onboarding draft: the plan they picked on /pricing plus the
      // practice name, so the wizard greets them with their own details.
      saveOnboardingState({
        ...(pickedPlanId ? { planId: pickedPlanId } : {}),
        ...(pickedInterval ? { interval: pickedInterval } : {}),
        ...(practiceName.trim() ? { practiceName: practiceName.trim() } : {}),
      })

      // Full reload so the new session cookie is picked up by middleware
      // (otherwise the redirect back to /onboarding-01 may flap).
      window.location.assign('/onboarding-01')
    } catch (err) {
      const message = (err as Error)?.message ?? 'Unable to create account'
      setError(message)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {pickedPlan && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-teal-50 dark:bg-teal-500/10 px-3 py-2 text-sm text-teal-700 dark:text-teal-300">
          <span className="font-semibold">{pickedPlan.name} plan</span>
          <span>
            — ${pickedInterval === 'annual' ? `${pickedPlan.annualPrice.toLocaleString('en-US')}/yr` : `${pickedPlan.price}/mo`}.
            Checkout comes after a quick setup.
          </span>
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="name">
            Your name <span className="text-rose-500">*</span>
          </label>
          <input
            id="name"
            className="form-input w-full"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Dr. Jane Lee"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="email">
            Work email <span className="text-rose-500">*</span>
          </label>
          <input
            id="email"
            className="form-input w-full"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="practice-name">
            Practice name
          </label>
          <input
            id="practice-name"
            className="form-input w-full"
            type="text"
            value={practiceName}
            onChange={(e) => setPracticeName(e.target.value)}
            autoComplete="organization"
            placeholder="Bright Smile Dental"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Optional — we&apos;ll ask in setup if you skip it.</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="password">
            Password <span className="text-rose-500">*</span>
          </label>
          <input
            id="password"
            className="form-input w-full"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>
      </div>
      {error && (
        <div className="mt-4 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded">
          {error}
        </div>
      )}
      <div className="mt-6">
        <ActionButton type="submit" variant="primary" disabled={loading} className="w-full">
          {loading ? 'Creating your account…' : 'Create account'}
        </ActionButton>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          No contract, cancel anytime. Your card isn&apos;t charged until you pick a plan at checkout.
        </p>
      </div>
    </form>
  )
}
