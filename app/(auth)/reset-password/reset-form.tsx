'use client'

import { useState } from 'react'
import { requestPasswordReset } from '@/lib/auth-client'

export default function ResetForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: err } = await requestPasswordReset({
      email,
      redirectTo: '/signin',
    })
    setLoading(false)
    if (err) {
      setError(err.message ?? 'Unable to send reset link')
      return
    }
    setSent(true)
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
