'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient, signUp } from '@/lib/auth/client'
import { DreamCreateLogo } from '@/components/brand/dream-create-logo'
import { isDeploymentSkewError } from '@/lib/auth/submit-guard'
import { TONE_PILL } from '@/lib/ui/encodings'
import { ActionButton } from '@/components/ui/action-button'
import { TextInput } from '@/components/ui/form-fields'
import { getCallerInviteDetailsAction, completeCallerAcceptAction } from './accept-actions'
import type { CallerInviteDetails } from '@/lib/services/prospect-callers'

type Step =
  | { type: 'loading' }
  | { type: 'refreshing' }
  // The signed-in user's email matches the invite — one click to accept.
  | { type: 'confirm'; details: CallerInviteDetails }
  // Signed in as a DIFFERENT user than the invite is for.
  | { type: 'wrongUser'; details: CallerInviteDetails; signedInAs: string }
  // No session — render create / password / magic-link per account state.
  | { type: 'needsAccount'; details: CallerInviteDetails }
  | { type: 'accepting' }
  | { type: 'magicSent'; email: string }
  | { type: 'success' }
  | { type: 'error'; message: string; expired?: boolean }

function AcceptInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''

  const [step, setStep] = useState<Step>({ type: 'loading' })
  // For the no-account state: how the user chooses to proceed. Defaults to the
  // resolved account state ('none' → create; 'password' → signin; 'magic-link'
  // → magic), but a user can switch (e.g. magic-link-only user prefers to set a
  // password).
  const [mode, setMode] = useState<'signup' | 'signin' | 'magic'>('signup')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Which control is working — the three steps render one at a time, but the
  // busy state still names its own button (the shared-pending rule).
  const [act, setAct] = useState<'signout' | 'magic' | 'password' | null>(null)
  const [formError, setFormError] = useState('')

  function onSkew() {
    setStep({ type: 'refreshing' })
    window.location.reload()
  }

  useEffect(() => {
    if (!token) {
      setStep({ type: 'error', message: 'Invalid invite link — no token found.' })
      return
    }
    async function init() {
      try {
        const [details, session] = await Promise.all([
          getCallerInviteDetailsAction(token),
          authClient.getSession(),
        ])
        if (!details) {
          setStep({ type: 'error', message: 'This invite link is invalid or has already been used.' })
          return
        }
        if (details.expired) {
          setStep({
            type: 'error',
            expired: true,
            message: 'This invite has expired. Ask your Dream Create contact to send a fresh one.',
          })
          return
        }

        const signedInAs = session.data?.user?.email ?? null
        if (signedInAs) {
          // Signed in — does the session email match the invite?
          if (signedInAs.trim().toLowerCase() === details.email.trim().toLowerCase()) {
            // Match → accept straight away (idempotent server-side).
            setStep({ type: 'accepting' })
            const r = await completeCallerAcceptAction(token)
            if (r.ok) setStep({ type: 'success' })
            else setStep({ type: 'confirm', details })
            return
          }
          // Different account — let them act on it (sign out + continue).
          setStep({ type: 'wrongUser', details, signedInAs })
          return
        }

        // No session — pick the affordance from the account state.
        setName(details.name)
        setMode(
          details.accountState === 'password'
            ? 'signin'
            : details.accountState === 'magic-link'
              ? 'magic'
              : 'signup',
        )
        setStep({ type: 'needsAccount', details })
      } catch (err) {
        if (isDeploymentSkewError(err)) return onSkew()
        setStep({ type: 'error', message: 'Something went wrong loading your invite. Refresh to try again.' })
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function accept(details: CallerInviteDetails) {
    setStep({ type: 'accepting' })
    try {
      const r = await completeCallerAcceptAction(token)
      if (r.ok) {
        setStep({ type: 'success' })
      } else {
        setStep({ type: 'needsAccount', details })
        setFormError(r.error ?? 'Could not accept the invite.')
      }
    } catch (err) {
      if (isDeploymentSkewError(err)) return onSkew()
      setStep({ type: 'needsAccount', details })
      setFormError('Something went wrong. Please try again.')
    }
  }

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (step.type !== 'needsAccount') return
    const { details } = step
    setAct('password')
    setSubmitting(true)
    setFormError('')
    try {
      const { error } = (await signUp.email({
        email: details.email,
        name: name.trim(),
        password,
      } as never)) as { error?: { message?: string } | null }
      if (error) {
        // A user already exists for this email (one-email-one-user) — flip to
        // sign-in mode with an explanatory note rather than dead-ending.
        if (isExistingUserError(error.message)) {
          setMode('signin')
          setFormError('You already have a Dream Create account for this email — sign in to connect it.')
          setSubmitting(false)
          return
        }
        setFormError(error.message ?? 'Could not create account. Try signing in instead.')
        setSubmitting(false)
        return
      }
      await accept(details)
    } catch (err) {
      if (isDeploymentSkewError(err)) return onSkew()
      setFormError('Something went wrong creating your account. Please try again.')
    }
    setSubmitting(false)
  }

  async function handleSignin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (step.type !== 'needsAccount') return
    const { details } = step
    setAct('password')
    setSubmitting(true)
    setFormError('')
    try {
      const { error } = await authClient.signIn.email({ email: details.email, password })
      if (error) {
        setFormError(error.message ?? 'Sign in failed. Check your password, or use a one-time email link.')
        setSubmitting(false)
        return
      }
      await accept(details)
    } catch (err) {
      if (isDeploymentSkewError(err)) return onSkew()
      setFormError('Something went wrong signing in. Please try again.')
    }
    setSubmitting(false)
  }

  async function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (step.type !== 'needsAccount') return
    const { details } = step
    setAct('magic')
    setSubmitting(true)
    setFormError('')
    try {
      // Round-trip back to THIS accept URL after verification, so the token
      // survives the sign-in hop and acceptance completes on return.
      const callbackURL = `/caller/accept?token=${encodeURIComponent(token)}`
      const { error } = await authClient.signIn.magicLink({ email: details.email, callbackURL })
      if (error && error.status === 429) {
        setFormError('Too many requests — wait a moment and try again.')
        setSubmitting(false)
        return
      }
      setStep({ type: 'magicSent', email: details.email })
    } catch (err) {
      if (isDeploymentSkewError(err)) return onSkew()
      setFormError('We couldn’t send the link right now. Try again in a moment.')
    }
    setSubmitting(false)
  }

  async function handleSignOut() {
    setAct('signout')
    setSubmitting(true)
    try {
      await authClient.signOut()
    } catch {
      /* ignore — we reload regardless */
    }
    // Reload the accept URL (token intact) as a signed-out visitor.
    window.location.assign(`/caller/accept?token=${encodeURIComponent(token)}`)
  }

  if (step.type === 'loading' || step.type === 'accepting' || step.type === 'refreshing') {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {step.type === 'accepting'
            ? 'Setting up your account…'
            : step.type === 'refreshing'
              ? 'Refreshing…'
              : 'Loading…'}
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {step.type === 'refreshing' ? 'We just shipped an update.' : 'Just a moment.'}
        </p>
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
          Your calling account is ready. Your page lists the practices to call, one at a time.
        </p>
        <ActionButton
          variant="primary"
          onClick={() => window.location.assign('/calls')}
          className="w-full"
        >
          Start calling
        </ActionButton>
      </Shell>
    )
  }

  if (step.type === 'magicSent') {
    return (
      <Shell>
        <p className="text-3xl mb-3">📬</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Check your inbox</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          We sent a one-time sign-in link to <span className="font-medium">{step.email}</span>. Open it on this
          device and you’ll land right back here to finish connecting your calling account. It expires in 15 minutes.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm underline hover:no-underline text-gray-600 dark:text-gray-300"
        >
          ← Back
        </button>
      </Shell>
    )
  }

  if (step.type === 'confirm') {
    const { details } = step
    return (
      <Shell>
        <p className="text-sm font-medium text-teal-700 dark:text-teal-400 mb-1">Dream Create — calling</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Accept your invite</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          You’re signed in as <span className="font-medium">{details.email}</span>. Connect this account to your
          calling queue.
        </p>
        {formError && (
          <p className={`mb-4 text-sm ${TONE_PILL.urgent} px-3 py-2 rounded-lg`}>{formError}</p>
        )}
        <ActionButton
          variant="primary"
          onClick={() => accept(details)}
          className="w-full"
        >
          Accept &amp; continue
        </ActionButton>
      </Shell>
    )
  }

  if (step.type === 'wrongUser') {
    const { details, signedInAs } = step
    return (
      <Shell>
        <p className="text-sm font-medium text-teal-700 dark:text-teal-400 mb-1">Dream Create — calling</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Wrong account</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          This invite is for <span className="font-medium">{details.email}</span>, but you’re signed in as{' '}
          <span className="font-medium">{signedInAs}</span>. Sign out and continue as {details.email} to accept it.
        </p>
        <ActionButton
          variant="primary"
          className="w-full"
          pending={submitting && act === 'signout'}
          disabled={submitting}
          onClick={handleSignOut}
        >
          Sign out &amp; continue as {details.email}
        </ActionButton>
      </Shell>
    )
  }

  if (step.type === 'needsAccount') {
    const { details } = step
    return (
      <Shell>
        <p className="text-sm font-medium text-teal-700 dark:text-teal-400 mb-1">Dream Create — calling</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          {mode === 'signup' ? 'Set up your account' : 'Sign in to accept'}
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          {mode === 'signup'
            ? 'Your own page with the practices to call, the script and the outcome keys — nothing else to learn.'
            : 'You already have a Dream Create account for this email — sign in to connect it to your calling queue.'}
        </p>

        {mode === 'magic' ? (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="pa-email-magic">Email</label>
              <TextInput id="pa-email-magic" type="email" value={details.email} disabled className="w-full opacity-60 cursor-not-allowed" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              We’ll email a one-time sign-in link to this address. No password needed.
            </p>
            {formError && (
              <p className={`text-sm ${TONE_PILL.urgent} px-3 py-2 rounded-lg`}>{formError}</p>
            )}
            <ActionButton
              type="submit"
              variant="primary"
              className="w-full"
              pending={submitting && act === 'magic'}
              disabled={submitting}
            >
              Email me a sign-in link
            </ActionButton>
          </form>
        ) : (
          <form onSubmit={mode === 'signin' ? handleSignin : handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="pa-email">Email</label>
              <TextInput id="pa-email" type="email" value={details.email} disabled className="w-full opacity-60 cursor-not-allowed" />
            </div>
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="pa-name">
                  Your name <span className="text-rose-500">*</span>
                </label>
                <TextInput id="pa-name" type="text" required value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Jordan Reyes" className="w-full" autoComplete="name" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="pa-pass">
                Password <span className="text-rose-500">*</span>
              </label>
              <TextInput id="pa-pass" type="password" required minLength={8} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signin' ? 'Your password' : 'Choose a password (8+ chars)'}
                className="w-full" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
            </div>
            {formError && (
              <p className={`text-sm ${TONE_PILL.urgent} px-3 py-2 rounded-lg`}>{formError}</p>
            )}
            <ActionButton
              type="submit"
              variant="primary"
              className="w-full"
              pending={submitting && act === 'password'}
              disabled={submitting}
            >
              {mode === 'signin' ? 'Sign in & accept' : 'Create account & accept'}
            </ActionButton>
            {/* Magic-link escape hatch — always offered so a forgotten password
                or a magic-link-only account never dead-ends. */}
            <button
              type="button"
              onClick={() => { setMode('magic'); setFormError(''); setPassword('') }}
              className="w-full text-center text-sm text-teal-600 hover:text-teal-700 dark:text-teal-400 font-medium"
            >
              Email me a one-time sign-in link instead
            </button>
            {mode === 'signin' && (
              <a
                href={`/reset-password?next=${encodeURIComponent(`/caller/accept?token=${token}`)}`}
                className="block text-center text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 underline"
              >
                Forgot your password?
              </a>
            )}
          </form>
        )}

        <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-700/60 text-sm text-gray-500 dark:text-gray-400">
          {mode === 'signup' ? (
            <>Already have an account?{' '}
              <button onClick={() => { setMode('signin'); setFormError(''); setPassword('') }} className="font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400">Sign in instead</button>
            </>
          ) : mode === 'magic' ? (
            <>Prefer a password?{' '}
              <button onClick={() => { setMode(details.accountState === 'none' ? 'signup' : 'signin'); setFormError(''); setPassword('') }} className="font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400">
                {details.accountState === 'none' ? 'Create an account' : 'Use your password'}
              </button>
            </>
          ) : (
            <>Don’t have an account?{' '}
              <button onClick={() => { setMode('signup'); setFormError(''); setPassword('') }} className="font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400">Create one</button>
            </>
          )}
        </div>
      </Shell>
    )
  }

  // error
  return (
    <Shell>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        {step.expired ? 'Invite expired' : 'Invite error'}
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{step.message}</p>
      <ActionButton variant="primary" onClick={() => router.push('/signin')} className="w-full">
        Back to sign in
      </ActionButton>
    </Shell>
  )
}

/** True when a signUp error message indicates the email already has a user. */
function isExistingUserError(message?: string): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return m.includes('already exist') || m.includes('user_already_exists') || m.includes('use another email')
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

export default function CallerAcceptPage() {
  return (
    <Suspense fallback={<Shell><p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p></Shell>}>
      <AcceptInner />
    </Suspense>
  )
}
