'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth/client'

export default function ResetForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: err } = await authClient.requestPasswordReset({
      email,
      redirectTo: '/reset-password/new',
    })

    setLoading(false)
    if (err) {
      setError(err.message ?? 'Could not send reset link')
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="text-sm text-gray-600 dark:text-gray-400 bg-green-500/10 border border-green-500/20 px-4 py-3 rounded">
        Check your inbox — we&apos;ve sent a password reset link to <strong>{email}</strong>.
        It expires in 1 hour.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
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
            required
            autoComplete="email"
            autoFocus
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 text-sm text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded">
          {error}
        </div>
      )}

      <div className="flex justify-end mt-6">
        <button
          type="submit"
          disabled={loading}
          className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white whitespace-nowrap disabled:opacity-60"
        >
          {loading ? 'Sending…' : 'Send Reset Link'}
        </button>
      </div>
    </form>
  )
}
