'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from '@/lib/auth/client'

export default function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') ?? '/'

  const notice = searchParams.get('notice')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInError } = await signIn.email({ email, password })

    if (signInError) {
      setError(signInError.message ?? 'Could not sign in')
      setLoading(false)
      return
    }

    router.push(redirectTo)
    router.refresh()
  }

  return (
    <>
    {notice === 'password-reset' && (
      <div className="mb-4 text-sm text-green-700 dark:text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-2 rounded">
        Password updated successfully. Sign in with your new password.
      </div>
    )}
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="email">Email Address</label>
          <input
            id="email"
            className="form-input w-full"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
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
            required
            autoComplete="current-password"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 text-sm text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-2 rounded">
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
    </>
  )
}
