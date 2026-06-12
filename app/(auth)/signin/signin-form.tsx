'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { signIn, authClient } from '@/lib/auth-client'
import { isDeploymentSkewError } from '@/lib/auth/submit-guard'

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
  // Passwordless mode — patients especially sign in twice a year; a one-tap
  // emailed link beats a forgotten password. 'sent' renders the check-your-
  // inbox state.
  const [mode, setMode] = useState<'password' | 'magic' | 'sent'>('password')

  async function onSendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: authError } = await authClient.signIn.magicLink({
        email,
        callbackURL: redirectTo,
      })
      if (authError) {
        // Don't reveal whether the email exists — the generic copy covers
        // both "sent" and "no such account" identically.
        if (authError.status === 429) {
          setError('Too many requests — wait a moment and try again.')
          setLoading(false)
          return
        }
      }
      setMode('sent')
      setLoading(false)
    } catch (err) {
      if (isDeploymentSkewError(err)) {
        setError('We just shipped an update — refreshing…')
        window.location.reload()
        return
      }
      setError('We couldn’t send the link right now. Try again in a moment.')
      setLoading(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Race the sign-in call against a wall-clock timeout so a stuck
    // request surfaces an error instead of spinning forever. Use
    // Promise.race rather than AbortController so we don't have to
    // thread fetch internals through better-auth's option shape.
    const timeout = new Promise<{ timedOut: true }>((resolve) =>
      setTimeout(() => resolve({ timedOut: true }), SIGN_IN_TIMEOUT_MS),
    )

    try {
      const result = await Promise.race([
        signIn.email({ email, password }).then((r) => ({ ...r, timedOut: false as const })),
        timeout,
      ])

      if ('timedOut' in result && result.timedOut) {
        setError('Sign-in is taking longer than expected. Check your connection and try again.')
        setLoading(false)
        return
      }

      const { error: authError } = result as { error?: { message?: string } | null }
      if (authError) {
        setError(authError.message ?? 'Unable to sign in')
        setLoading(false)
        return
      }

      // Full reload — guarantees the brand new session cookie is on the
      // next request so middleware doesn't redirect back to /signin.
      window.location.assign(redirectTo)
      // Don't unset loading; we're navigating away.
    } catch (err) {
      if (isDeploymentSkewError(err)) {
        setError('We just shipped an update — refreshing…')
        window.location.reload()
        return
      }
      setError((err as Error)?.message ?? 'Unable to sign in')
      setLoading(false)
    }
  }

  if (mode === 'sent') {
    return (
      <div className="text-center py-6">
        <p className="text-3xl mb-3">📬</p>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
          Check your inbox
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
          If we have an account for <span className="font-medium">{email}</span>, a link is on
          its way. If you&apos;re new, it&apos;ll be a quick set-up link instead. Either one works
          once and expires in 15 minutes.
        </p>
        <button
          type="button"
          className="mt-5 text-sm underline hover:no-underline text-gray-600 dark:text-gray-300"
          onClick={() => setMode('password')}
        >
          ← Back to sign in
        </button>
      </div>
    )
  }

  const magicMode = mode === 'magic'

  return (
    <form onSubmit={magicMode ? onSendMagicLink : onSubmit}>
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
        {!magicMode && (
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
        )}
      </div>
      {error && (
        <div className="mt-4 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between mt-6">
        <div className="mr-1">
          {magicMode ? (
            <button
              type="button"
              className="text-sm underline hover:no-underline"
              onClick={() => setMode('password')}
            >
              Use a password instead
            </button>
          ) : (
            <Link className="text-sm underline hover:no-underline" href="/reset-password">Forgot Password?</Link>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white ml-3 disabled:opacity-60"
        >
          {loading ? (magicMode ? 'Sending…' : 'Signing In…') : magicMode ? 'Email me a link' : 'Sign In'}
        </button>
      </div>
      {!magicMode && (
        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-medium"
          onClick={() => {
            setError(null)
            setMode('magic')
          }}
        >
          No password? Email me a sign-in link instead
        </button>
      )}
    </form>
  )
}
