'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient, signUp } from '@/lib/auth/client'
import { isDeploymentSkewError } from '@/lib/auth/submit-guard'
import { getInvitationDetails, type InvitationDetails } from './invite-details'
import { linkPatientRecord } from './link-patient'
import { acceptPatientPortalInvite } from './patient-invite'
import AuthHeader from '../auth-header'
import AuthImage from '../auth-image'

type ClinicBrand = NonNullable<InvitationDetails['brand']>

type Step =
  | { type: 'loading' }
  | { type: 'refreshing' }
  // No session — render create / password / magic-link per account state.
  | { type: 'needsAccount'; details: InvitationDetails }
  // Signed in as a DIFFERENT user than the invite is for.
  | { type: 'wrongUser'; details: InvitationDetails; signedInAs: string }
  | { type: 'accepting' }
  | { type: 'magicSent'; email: string }
  | { type: 'success'; orgName: string; isClinic: boolean }
  | { type: 'error'; message: string; expired?: boolean }

function AcceptInviteInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [step, setStep] = useState<Step>({ type: 'loading' })
  // 'signup' | 'signin' | 'magic' — initialized from the resolved account
  // state, switchable by the user.
  const [authMode, setAuthMode] = useState<'signup' | 'signin' | 'magic'>('signup')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  // Clinic branding for the invite's org (null for platform/staff invites,
  // which keep the default platform style).
  const [brand, setBrand] = useState<ClinicBrand | null>(null)
  const [isClinic, setIsClinic] = useState(false)
  const accent = brand?.brandColor || null

  function onSkew() {
    setStep({ type: 'refreshing' })
    window.location.reload()
  }

  useEffect(() => {
    if (!token) {
      setStep({ type: 'error', message: 'Invalid invitation link — no token found.' })
      return
    }

    async function init() {
      try {
        const [details, sessionResult] = await Promise.all([
          getInvitationDetails(token),
          authClient.getSession(),
        ])

        if (!details) {
          setStep({ type: 'error', message: 'This invitation link is invalid or has already been used.' })
          return
        }
        if (details.expired) {
          setStep({
            type: 'error',
            expired: true,
            message: 'This invitation has expired. Ask to be re-invited.',
          })
          return
        }

        setBrand(details.brand ?? null)
        setIsClinic(details.orgType === 'clinic')

        const signedInAs = sessionResult.data?.user?.email ?? null
        if (signedInAs) {
          // Signed in — does the session email match the invite email?
          if (signedInAs.trim().toLowerCase() === details.email.trim().toLowerCase()) {
            setStep({ type: 'accepting' })
            await acceptNow(details.orgName, details.role, details.orgType === 'clinic')
          } else {
            // Different account — staff invites COULD be accepted by any
            // signed-in user via better-auth, but that's the Bug-2 trap (the
            // founder's personal account claiming a partner/patient invite).
            // Always make the mismatch explicit and offer to switch.
            setStep({ type: 'wrongUser', details, signedInAs })
          }
          return
        }

        // No session — choose the affordance from the account state.
        setAuthMode(
          details.accountState === 'password'
            ? 'signin'
            : details.accountState === 'magic-link'
              ? 'magic'
              : 'signup',
        )
        setStep({ type: 'needsAccount', details })
      } catch (err) {
        if (isDeploymentSkewError(err)) return onSkew()
        setStep({ type: 'error', message: 'Something went wrong loading your invitation. Refresh to try again.' })
      }
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function acceptNow(orgName: string, role: string, clinic: boolean) {
    try {
      // Patient invites use a dedicated accept path — better-auth's role set is
      // owner/admin/member only, so claiming a patient invite through it would
      // create a clinic 'member' and drop the patient into the admin dashboard.
      if (role === 'patient') {
        const r = await acceptPatientPortalInvite(token)
        if (!r.ok) {
          setStep({ type: 'error', message: r.error })
          return
        }
        setStep({ type: 'success', orgName, isClinic: clinic })
        return
      }
      const result = await authClient.organization.acceptInvitation({ invitationId: token })
      if (result.error) {
        setStep({
          type: 'error',
          message: result.error.message ?? 'Could not accept the invitation.',
        })
        return
      }
      // Link the patient record (org resolved from the invite token) BEFORE
      // showing success, so the portal has a resolved patientId on the next
      // request. Awaited but non-fatal — the membership already succeeded.
      try {
        await linkPatientRecord(token)
      } catch {
        /* non-fatal */
      }
      setStep({ type: 'success', orgName, isClinic: clinic })
    } catch (err) {
      if (isDeploymentSkewError(err)) return onSkew()
      setStep({ type: 'error', message: 'Something went wrong accepting your invitation. Refresh to try again.' })
    }
  }

  async function handleCreateAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (step.type !== 'needsAccount') return
    setSubmitting(true)
    setFormError('')
    const { details } = step

    try {
      const { error: signUpError } = (await signUp.email({
        email: details.email,
        name: name.trim(),
        password,
      } as never)) as { error?: { message?: string } | null }
      if (signUpError) {
        // One-email-one-user: an account already exists. Flip to sign-in with
        // an explanatory note rather than dead-ending on "user already exists".
        if (isExistingUserError(signUpError.message)) {
          setAuthMode('signin')
          setFormError('You already have an account for this email — sign in to accept your invitation.')
          setSubmitting(false)
          return
        }
        setFormError(signUpError.message ?? 'Could not create account. Try signing in instead.')
        setSubmitting(false)
        return
      }

      setStep({ type: 'accepting' })
      await acceptNow(details.orgName, details.role, details.orgType === 'clinic')
    } catch (err) {
      if (isDeploymentSkewError(err)) return onSkew()
      setFormError('Something went wrong creating your account. Please try again.')
    }
    setSubmitting(false)
  }

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (step.type !== 'needsAccount') return
    setSubmitting(true)
    setFormError('')
    const { details } = step

    try {
      const { error: signInError } = await authClient.signIn.email({
        email: details.email,
        password,
      })
      if (signInError) {
        setFormError(signInError.message ?? 'Sign in failed. Check your password, or use a one-time email link.')
        setSubmitting(false)
        return
      }

      setStep({ type: 'accepting' })
      await acceptNow(details.orgName, details.role, details.orgType === 'clinic')
    } catch (err) {
      if (isDeploymentSkewError(err)) return onSkew()
      setFormError('Something went wrong signing in. Please try again.')
    }
    setSubmitting(false)
  }

  async function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (step.type !== 'needsAccount') return
    setSubmitting(true)
    setFormError('')
    const { details } = step
    try {
      // Round-trip back to THIS accept URL so the token survives the sign-in
      // hop and acceptance completes when they return signed in.
      const callbackURL = `/accept-invite?token=${encodeURIComponent(token)}`
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
    setSubmitting(true)
    try {
      await authClient.signOut()
    } catch {
      /* ignore — we reload regardless */
    }
    window.location.assign(`/accept-invite?token=${encodeURIComponent(token)}`)
  }

  if (step.type === 'loading' || step.type === 'accepting' || step.type === 'refreshing') {
    return (
      <div className="max-w-sm mx-auto w-full px-4 py-8">
        <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-4">
          {step.type === 'accepting' ? 'Joining your clinic…' : step.type === 'refreshing' ? 'Refreshing…' : 'Loading…'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {step.type === 'refreshing' ? 'We just shipped an update.' : 'Please wait a moment.'}
        </p>
      </div>
    )
  }

  if (step.type === 'wrongUser') {
    const { details, signedInAs } = step
    return (
      <div className="max-w-sm mx-auto w-full px-4 py-8">
        <div className="mb-6">
          {isClinic && brand?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={details.orgName} className="h-12 w-auto object-contain mb-4" />
          )}
          <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">Wrong account</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            This invitation is for <span className="font-medium">{details.email}</span>, but you&apos;re signed in as{' '}
            <span className="font-medium">{signedInAs}</span>. Sign out and continue as {details.email} to accept it.
          </p>
        </div>
        <button
          onClick={handleSignOut}
          disabled={submitting}
          className="btn w-full text-white hover:opacity-90 disabled:opacity-60 bg-gray-900 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
          style={accent ? { backgroundColor: accent, color: '#fff' } : undefined}
        >
          {submitting ? 'Signing out…' : `Sign out & continue as ${details.email}`}
        </button>
      </div>
    )
  }

  if (step.type === 'magicSent') {
    return (
      <div className="max-w-sm mx-auto w-full px-4 py-8 text-center">
        <p className="text-3xl mb-3">📬</p>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Check your inbox</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          We sent a one-time sign-in link to <span className="font-medium">{step.email}</span>. Open it on this device
          and you&apos;ll land right back here to finish accepting your invitation. It expires in 15 minutes.
        </p>
        <button
          type="button"
          className="mt-5 text-sm underline hover:no-underline text-gray-600 dark:text-gray-300"
          onClick={() => window.location.reload()}
        >
          ← Back
        </button>
      </div>
    )
  }

  if (step.type === 'needsAccount') {
    const { details } = step
    const isPatient = details.role === 'patient'
    const isSignIn = authMode === 'signin'
    const isMagic = authMode === 'magic'

    return (
      <div className="max-w-sm mx-auto w-full px-4 py-8">
        <div className="mb-6">
          {/* Clinic logo when this is a clinic invite — the patient should feel
              they're joining THEIR dentist, not generic software. */}
          {isClinic && brand?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={details.orgName}
              className="h-12 w-auto object-contain mb-4"
            />
          )}
          {/* Brand accent when a clinic, else fall back to platform teal. */}
          <p
            className={`text-sm font-medium mb-1 ${accent ? '' : 'text-teal-700 dark:text-teal-400'}`}
            style={accent ? { color: accent } : undefined}
          >
            {isPatient ? 'Your patient portal' : "You're invited to join"}
          </p>
          <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold">
            {isClinic && isPatient ? `Join ${details.orgName}` : details.orgName}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isSignIn || isMagic ? (
              'You already have an account for this email — sign in to accept your invitation.'
            ) : isClinic && isPatient ? (
              'See your visits, book appointments, message the office, and fill out forms ahead of time.'
            ) : (
              <>
                as <span className="font-medium capitalize">{details.role}</span>
              </>
            )}
          </p>
        </div>

        {isMagic ? (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input type="email" value={details.email} disabled className="form-input w-full opacity-60 cursor-not-allowed" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              We&apos;ll email a one-time sign-in link to this address. No password needed.
            </p>
            {formError && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg">{formError}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="btn w-full text-white hover:opacity-90 disabled:opacity-60 bg-gray-900 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
              style={accent ? { backgroundColor: accent, color: '#fff' } : undefined}
            >
              {submitting ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        ) : (
          <form onSubmit={isSignIn ? handleSignIn : handleCreateAccount} className="space-y-4">
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
              className="btn w-full text-white hover:opacity-90 disabled:opacity-60 bg-gray-900 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
              style={accent ? { backgroundColor: accent, color: '#fff' } : undefined}
            >
              {submitting
                ? isSignIn
                  ? 'Signing in…'
                  : 'Creating account…'
                : isSignIn
                  ? 'Sign In & Accept Invite'
                  : 'Create Account & Accept Invite'}
            </button>

            {/* Magic-link escape hatch — a forgotten password or magic-link-only
                account never dead-ends here. */}
            <button
              type="button"
              onClick={() => { setAuthMode('magic'); setFormError(''); setPassword('') }}
              className={`w-full text-center text-sm font-medium ${accent ? '' : 'text-teal-600 hover:text-teal-700 dark:text-teal-400'}`}
              style={accent ? { color: accent } : undefined}
            >
              Email me a one-time sign-in link instead
            </button>
            {isSignIn && (
              <a
                href={`/reset-password?next=${encodeURIComponent(`/accept-invite?token=${token}`)}`}
                className="block text-center text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 underline"
              >
                Forgot your password?
              </a>
            )}
          </form>
        )}

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
                className={`font-medium hover:underline ${accent ? '' : 'text-teal-600 hover:text-teal-700 dark:text-teal-400'}`}
                style={accent ? { color: accent } : undefined}
              >
                Create one
              </button>
            </>
          ) : isMagic ? (
            <>
              Prefer a password?{' '}
              <button
                onClick={() => {
                  setAuthMode(details.accountState === 'none' ? 'signup' : 'signin')
                  setFormError('')
                  setPassword('')
                }}
                className={`font-medium hover:underline ${accent ? '' : 'text-teal-600 hover:text-teal-700 dark:text-teal-400'}`}
                style={accent ? { color: accent } : undefined}
              >
                {details.accountState === 'none' ? 'Create an account' : 'Use your password'}
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
                className={`font-medium hover:underline ${accent ? '' : 'text-teal-600 hover:text-teal-700 dark:text-teal-400'}`}
                style={accent ? { color: accent } : undefined}
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
          {step.orgName
            ? step.isClinic
              ? `Welcome to ${step.orgName}.`
              : `Welcome to ${step.orgName} on DreamCRM.`
            : "You've joined successfully."}
        </p>
        <button
          onClick={() => window.location.assign('/')}
          className="btn w-full text-white hover:opacity-90 bg-gray-900 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
          style={accent ? { backgroundColor: accent, color: '#fff' } : undefined}
        >
          {step.isClinic ? 'Go to my portal' : 'Go to dashboard'}
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
      <h1 className="text-3xl text-gray-800 dark:text-gray-100 font-bold mb-2">
        {step.expired ? 'Invitation expired' : 'Invitation error'}
      </h1>
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

/** True when a signUp error message indicates the email already has a user. */
function isExistingUserError(message?: string): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return m.includes('already exist') || m.includes('user_already_exists') || m.includes('use another email')
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
