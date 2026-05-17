'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { signIn } from '@/lib/auth-client'

// If the sign-in fetch ever exceeds this, surface an error so the user
// isn't stuck staring at "Signing In…". Cold DB cold start should be
// well under 10s; 25 is generous.
const SIGN_IN_TIMEOUT_MS = 25_000

export default function SignInForm() {
  const params = useSearchParams()
  const redirectTo = params.get('redirect') || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Race the sign-in call against an abort timer so a stuck request
    // surfaces an error instead of spinning forever.
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), SIGN_IN_TIMEOUT_MS)

    try {
      const { error: authError } = await signIn.email(
        { email, password },
        { signal: abort.signal as any }
      )
      clearTimeout(timer)
      if (authError) {
        setError(authError.message ?? 'Unable to sign in')
        setLoading(false)
        return
      }
      // Full reload — guarantees the brand new session cookie is on the
      // next request so middleware doesn't redirect back to /signin.
      // Also avoids the race between router.push and cookie flush.
      window.location.assign(redirectTo)
      // Don't unset loading; we're navigating away.
    } catch (err) {
      clearTimeout(timer)
      const message =
        (err as Error)?.name === 'AbortError'
          ? "Sign-in is taking longer than expected. Check your connection and try again."
          : (err as Error)?.message ?? 'Unable to sign in'
      setError(message)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="email">Email Address</label>
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
          <label className="block text-sm font-medium mb-1" htmlFor="password">Password</label>
          <input
            id="password"
            className="form-input w-full"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
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
          <Link className="text-sm underline hover:no-underline" href="/reset-password">Forgot Password?</Link>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white ml-3 disabled:opacity-60"
        >
          {loading ? 'Signing In…' : 'Sign In'}
        </button>
      </div>
    </form>
  )
}
