'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { requestPasswordReset } from '@/lib/auth-client'
import { isDeploymentSkewError } from '@/lib/auth/submit-guard'

/** Only accept a same-origin relative path as the post-reset return target, so
 *  ?next= can't be turned into an open redirect. */
function safeNext(raw: string | null): string {
  if (!raw) return '/signin'
  // Must be a root-relative path (not "//evil.com" or "https://…").
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/signin'
  return raw
}

export default function ResetForm() {
  const params = useSearchParams()
  // Threaded by the accept pages' "forgot password" link so a reset started
  // from an invite returns the user to the accept URL afterwards.
  const next = safeNext(params.get('next'))

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error: err } = await requestPasswordReset({
        email,
        redirectTo: next,
      })
      setLoading(false)
      if (err) {
        setError(err.message ?? 'Unable to send reset link')
        return
      }
      setSent(true)
    } catch (caught) {
      if (isDeploymentSkewError(caught)) {
        setError('We just shipped an update — refreshing…')
        window.location.reload()
        return
      }
      setLoading(false)
      setError('Unable to send reset link. Try again in a moment.')
    }
  }

  if (sent) {
    return (
      <div className="text-sm text-green-700 bg-green-50 dark:bg-green-500/10 px-3 py-3 rounded">
        If an account exists for <strong>{email}</strong>, a reset link has been sent.
      </div>
    )
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
      </div>
      {error && (
        <div className="mt-4 text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">
          {error}
        </div>
      )}
      <div className="mt-6">
        <button
          type="submit"
          disabled={loading}
          className="btn w-full bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-gray-900 dark:hover:bg-teal-400 disabled:opacity-60"
        >
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </div>
    </form>
  )
}
