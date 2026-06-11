'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient, signUp } from '@/lib/auth/client'
import { DreamCreateLogo } from '@/components/brand/dream-create-logo'
import { getPartnerInviteDetailsAction, completePartnerAcceptAction } from './accept-actions'
import type { PartnerInviteDetails } from '@/lib/services/referrals'

type Step =
  | { type: 'loading' }
  | { type: 'needsAccount'; details: PartnerInviteDetails }
  | { type: 'accepting' }
  | { type: 'success' }
  | { type: 'error'; message: string }

function AcceptInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''

  const [step, setStep] = useState<Step>({ type: 'loading' })
  const [mode, setMode] = useState<'signup' | 'signin'>('signup')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!token) {
      setStep({ type: 'error', message: 'Invalid invite link — no token found.' })
      return
    }
    async function init() {
      const [details, session] = await Promise.all([
        getPartnerInviteDetailsAction(token),
        authClient.getSession(),
      ])
      if (!details) {
        setStep({ type: 'error', message: 'This invite link is invalid or has already been used.' })
        return
      }
      if (session.data?.session) {
        setStep({ type: 'accepting' })
        const r = await completePartnerAcceptAction(token)
        if (r.ok) {
          setStep({ type: 'success' })
        } else {
          // Signed in as the wrong account — let them act on it.
          setStep({ type: 'needsAccount', details })
          setFormError(r.error ?? '')
          setMode('signin')
        }
        return
      }
      setName(details.name)
      setStep({ type: 'needsAccount', details })
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function accept() {
    setStep({ type: 'accepting' })
    const r = await completePartnerAcceptAction(token)
    if (r.ok) setStep({ type: 'success' })
    else {
      setStep({ type: 'needsAccount', details: (step as { details: PartnerInviteDetails }).details })
      setFormError(r.error ?? 'Could not accept the invite.')
    }
  }

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (step.type !== 'needsAccount') return
    setSubmitting(true)
    setFormError('')
    const { error } = (await signUp.email({
      email: step.details.email,
      name: name.trim(),
      password,
    } as never)) as { error?: { message?: string } | null }
    if (error) {
      setFormError(error.message ?? 'Could not create account. Try signing in instead.')
      setSubmitting(false)
      return
    }
    await accept()
    setSubmitting(false)
  }

  async function handleSignin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (step.type !== 'needsAccount') return
    setSubmitting(true)
    setFormError('')
    const { error } = await authClient.signIn.email({ email: step.details.email, password })
    if (error) {
      setFormError(error.message ?? 'Sign in failed. Check your password.')
      setSubmitting(false)
      return
    }
    await accept()
    setSubmitting(false)
  }

  if (step.type === 'loading' || step.type === 'accepting') {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {step.type === 'accepting' ? 'Setting up your account…' : 'Loading…'}
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">Just a moment.</p>
      </Shell>
    )
  }

  if (step.type === 'success') {
    return (
      <Shell>
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 mb-5">
          <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">You’re all set</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Your partner account is ready. Head to your portal to see your clinics and set up payouts.
        </p>
        <button
          onClick={() => window.location.assign('/partner')}
          className="btn bg-teal-500 hover:bg-teal-600 text-white dark:bg-teal-400 dark:hover:bg-teal-300 dark:text-gray-900 w-full"
        >
          Go to my partner portal
        </button>
      </Shell>
    )
  }

  if (step.type === 'needsAccount') {
    const { details } = step
    const isSignIn = mode === 'signin'
    return (
      <Shell>
        <p className="text-sm font-medium text-teal-700 dark:text-teal-400 mb-1">Dream Create partner program</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Set up your account</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          See the clinics you refer, track your commission, and connect a payout method.
        </p>

        <form onSubmit={isSignIn ? handleSignin : handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" value={details.email} disabled className="form-input w-full opacity-60 cursor-not-allowed" />
          </div>
          {!isSignIn && (
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="pa-name">
                Your name <span className="text-rose-500">*</span>
              </label>
              <input id="pa-name" type="text" required value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Jordan Reyes" className="form-input w-full" autoComplete="name" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="pa-pass">
              Password <span className="text-rose-500">*</span>
            </label>
            <input id="pa-pass" type="password" required minLength={8} value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignIn ? 'Your password' : 'Choose a password (8+ chars)'}
              className="form-input w-full" autoComplete={isSignIn ? 'current-password' : 'new-password'} />
          </div>
          {formError && (
            <p className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded-lg">{formError}</p>
          )}
          <button type="submit" disabled={submitting}
            className="btn w-full bg-teal-500 hover:bg-teal-600 text-white dark:bg-teal-400 dark:hover:bg-teal-300 dark:text-gray-900 disabled:opacity-60">
            {submitting ? (isSignIn ? 'Signing in…' : 'Creating account…') : isSignIn ? 'Sign in & accept' : 'Create account & accept'}
          </button>
        </form>

        <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-700/60 text-sm text-gray-500 dark:text-gray-400">
          {isSignIn ? (
            <>Don’t have an account?{' '}
              <button onClick={() => { setMode('signup'); setFormError(''); setPassword('') }} className="font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400">Create one</button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button onClick={() => { setMode('signin'); setFormError(''); setPassword('') }} className="font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400">Sign in instead</button>
            </>
          )}
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Invite error</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{step.message}</p>
      <button onClick={() => router.push('/signin')} className="btn w-full bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900">
        Back to sign in
      </button>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="v2-app min-h-screen flex flex-col bg-[color:var(--color-canvas)]">
      <header className="aura-chrome border-b border-gray-200/70 dark:border-gray-700/60">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 h-16 flex items-center">
          <DreamCreateLogo size={26} />
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm v2-card p-6">{children}</div>
      </main>
    </div>
  )
}

export default function PartnerAcceptPage() {
  return (
    <Suspense fallback={<Shell><p className="text-sm text-gray-500">Loading…</p></Shell>}>
      <AcceptInner />
    </Suspense>
  )
}
