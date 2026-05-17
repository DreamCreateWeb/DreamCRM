'use client'

import { useState } from 'react'
import { signUp } from '@/lib/auth-client'

const ROLES = ['Designer', 'Developer', 'Accountant', 'Marketer', 'Manager', 'Other']
const SIGN_UP_TIMEOUT_MS = 25_000

export default function SignUpForm() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState(ROLES[0])
  const [password, setPassword] = useState('')
  const [newsletter, setNewsletter] = useState(false)
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
        signUp
          .email({
            email,
            password,
            name,
            // additional custom fields registered in lib/auth/server.ts
            ...({ newsletter, accountType: role } as Record<string, unknown>),
          } as any)
          .then((r) => ({ ...r, timedOut: false as const })),
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
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="email">
            Email Address <span className="text-red-500">*</span>
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
          <label className="block text-sm font-medium mb-1" htmlFor="name">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            className="form-input w-full"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="role">
            Your Role <span className="text-red-500">*</span>
          </label>
          <select
            id="role"
            className="form-select w-full"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="password">Password</label>
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
        <div className="mt-4 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between mt-6">
        <div className="mr-1">
          <label className="flex items-center">
            <input
              type="checkbox"
              className="form-checkbox"
              checked={newsletter}
              onChange={(e) => setNewsletter(e.target.checked)}
            />
            <span className="text-sm ml-2">Email me about product news.</span>
          </label>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white ml-3 whitespace-nowrap disabled:opacity-60"
        >
          {loading ? 'Creating…' : 'Sign Up'}
        </button>
      </div>
    </form>
  )
}
