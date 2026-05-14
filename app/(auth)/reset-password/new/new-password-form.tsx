'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth/client'

export default function NewPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const errorParam = searchParams.get('error')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(
    errorParam === 'INVALID_TOKEN' ? 'This reset link has expired or is invalid. Please request a new one.' : null
  )
  const [loading, setLoading] = useState(false)

  if (!token && !errorParam) {
    return (
      <div className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded">
        Invalid reset link. Please request a new one.
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (!token) return

    setLoading(true)
    const { error: err } = await authClient.resetPassword({ newPassword: password, token })
    setLoading(false)

    if (err) {
      setError(err.message ?? 'Could not reset password')
      return
    }

    router.push('/signin?notice=password-reset')
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="password">
            New Password <span className="text-red-500">*</span>
          </label>
          <input
            id="password"
            className="form-input w-full"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="confirm">
            Confirm Password <span className="text-red-500">*</span>
          </label>
          <input
            id="confirm"
            className="form-input w-full"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
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
          disabled={loading || !token}
          className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white whitespace-nowrap disabled:opacity-60"
        >
          {loading ? 'Saving…' : 'Set New Password'}
        </button>
      </div>
    </form>
  )
}
