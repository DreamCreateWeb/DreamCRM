'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient, signUp } from '@/lib/auth/client'
import { getInvitationDetails, type InvitationDetails } from './invite-details'
import { linkPatientRecord } from './link-patient'
import AuthHeader from '../auth-header'
import AuthImage from '../auth-image'

type Step =
  | { type: 'loading' }
  | { type: 'needsAccount'; details: InvitationDetails }
  | { type: 'accepting' }
  | { type: 'success'; orgName: string }
  | { type: 'error'; message: string }

function AcceptInviteInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [step, setStep] = useState<Step>({ type: 'loading' })
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!token) {
      setStep({ type: 'error', message: 'Invalid invitation link — no token found.' })
      return
    }

    async function init() {
      const [details, sessionResult] = await Promise.all([
        getInvitationDetails(token),
        authClient.getSession(),
      ])

      if (!details) {
        setStep({ type: 'error', message: 'This invitation link is invalid or has already been used.' })
        return
      }
      if (details.expired) {
        setStep({ type: 'error', message: 'This invitation has expired. Ask to be re-invited.' })
        return
      }

      if (sessionResult.data?.session) {
        setStep({ type: 'accepting' })
        acceptNow(details.orgName)
      } else {
        setStep({ type: 'needsAccount', details })
      }
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function acceptNow(orgName: string) {
    const result = await authClient.organization.acceptInvitation({ invitationId: token })
    if (result.error) {
      setStep({
        type: 'error',
        message: result.error.message ?? 'Could not accept the invitation.',
      })
      return
    }
    linkPatientRecord().catch(() => {})
    setStep({ type: 'success', orgName })
  }

  async function handleCreateAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (step.type !== 'needsAccount') return
    setSubmitting(true)
    setFormError('')
    const { details } = step

    const { error: signUpError } = (await signUp.email({
      email: details.email,
      name: name.trim(),
      password,
    } as never)) as { error?: { message?: string } | null }
    if (signUpError) {
      setFormError(signUpError.message ?? 'Could not create account. Try signing in instead.')
      setSubmitting(false)
      return
    }

    setStep({ type: 'accepting' })
    await acceptNow(details.orgName)
    setSubmitting(false)
  }

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (step.type !== 'needsAccount') return
    setSubmitting(true)
    setFormError('')
    const { details } = step

    const { error: signInError } = await authClient.signIn.email({
      email: details.email,
      password,
    })
    if (signInError) {
      setFormError(signInError.message ?? 'Sign in failed. Check your password.')
      setSubmitting(false)
      return
    }

    setStep({ type: 'accepting' })
    await acceptNow(details.orgName)
    setSubmitting(false)
  }

  if (step.type === 'loading' || step.type === 'accepting') {
    return (
      <div className="max-w-sm mx-auto w-full px-4 py-8">
        <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-4">
          {step.type === 'accepting' ? 'Joining your clinic…' : 'Loading…'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Please wait a moment.</p>
      </div>
    )
  }

  if (step.type === 'needsAccount') {
    const { details } = step
    const isSignIn = authMode === 'signin'

    return (
      <div className="max-w-sm mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <p className="text-sm font-medium text-violet-600 dark:text-violet-400 mb-1">
            You&apos;re invited to join
          </p>
          <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold">{details.orgName}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            as <span className="font-medium capitalize">{details.role}</span>
          </p>
        </div>

        <form
          onSubmit={isSignIn ? handleSignIn : handleCreateAccount}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={details.email}
              disabled
              className="form-input w-full opacity-60 cursor-not-allowed"
            />
          </div>

          {!isSignIn && (
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="ai-name">
                Your Full Name <span className="text-red-500">*</span>
              </label>
              <input
                id="ai-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                className="form-input w-full"
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="ai-password">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              id="ai-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignIn ? 'Your password' : 'Choose a password (8+ chars)'}
              className="form-input w-full"
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
            />
          </div>

          {formError && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn w-full bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-60"
          >
            {submitting
              ? isSignIn
                ? 'Signing in…'
                : 'Creating account…'
              : isSignIn
                ? 'Sign In & Accept Invite'
                : 'Create Account & Accept Invite'}
          </button>
        </form>

        <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-700/60 text-sm text-gray-500">
          {isSignIn ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                onClick={() => {
                  setAuthMode('signup')
                  setFormError('')
                  setPassword('')
                }}
                className="font-medium text-violet-500 hover:text-violet-600"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => {
                  setAuthMode('signin')
                  setFormError('')
                  setPassword('')
                }}
                className="font-medium text-violet-500 hover:text-violet-600"
              >
                Sign in instead
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (step.type === 'success') {
    return (
      <div className="max-w-sm mx-auto w-full px-4 py-8">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 mb-6">
          <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">You&apos;re in!</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          {step.orgName ? `Welcome to ${step.orgName} on DreamCRM.` : "You've joined successfully."}
        </p>
        <button
          onClick={() => router.push('/')}
          className="btn w-full bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
        >
          Go to dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto w-full px-4 py-8">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-500/20 mb-6">
        <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">Invitation error</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">{step.message}</p>
      <button
        onClick={() => router.push('/signin')}
        className="btn w-full bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
      >
        Back to sign in
      </button>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <main className="bg-white dark:bg-gray-900">
      <div className="relative md:flex">
        <div className="md:w-1/2">
          <div className="min-h-[100dvh] h-full flex flex-col after:flex-1">
            <AuthHeader />
            <Suspense
              fallback={
                <div className="max-w-sm mx-auto w-full px-4 py-8 text-sm text-gray-400">
                  Loading…
                </div>
              }
            >
              <AcceptInviteInner />
            </Suspense>
          </div>
        </div>
        <AuthImage />
      </div>
    </main>
  )
}
