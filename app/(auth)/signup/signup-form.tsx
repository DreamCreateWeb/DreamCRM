'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signUp, organization } from '@/lib/auth/client'

export default function SignUpForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [clinicName, setClinicName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // 1. Create the user account
    const { error: signUpError } = await signUp.email({ email, password, name })
    if (signUpError) {
      setError(signUpError.message ?? 'Could not create account')
      setLoading(false)
      return
    }

    // 2. Create the clinic organization for this user
    const slug = clinicName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const { error: orgError } = await organization.create({
      name: clinicName,
      slug,
    })
    if (orgError) {
      setError(orgError.message ?? 'Account created but could not create clinic')
      setLoading(false)
      return
    }

    router.push('/onboarding-01')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="email">Email Address <span className="text-red-500">*</span></label>
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
          <label className="block text-sm font-medium mb-1" htmlFor="name">Your Full Name <span className="text-red-500">*</span></label>
          <input
            id="name"
            className="form-input w-full"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="clinic">Clinic Name <span className="text-red-500">*</span></label>
          <input
            id="clinic"
            className="form-input w-full"
            type="text"
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            required
            placeholder="Smile Dental"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="password">Password <span className="text-red-500">*</span></label>
          <input
            id="password"
            className="form-input w-full"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

      <div className="flex items-center justify-between mt-6">
        <div className="mr-1">
          <label className="flex items-center">
            <input type="checkbox" className="form-checkbox" defaultChecked />
            <span className="text-sm ml-2">Email me product updates.</span>
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

      <div className="pt-5 mt-6 border-t border-gray-100 dark:border-gray-700/60">
        <div className="text-sm">
          Have an account? <Link className="font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400" href="/signin">Sign In</Link>
        </div>
      </div>
    </form>
  )
}
