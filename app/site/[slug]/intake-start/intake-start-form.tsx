'use client'

import { useState } from 'react'
import { authClient, signUp } from '@/lib/auth/client'
import { linkUserToClinicAsPatient } from './actions'

interface Props {
  orgId: string
  clinicName: string
  brand: string
}

type Mode = 'signup' | 'signin'

const INK = '#1C1A17'
const INK_MUTED = '#6B635A'
const SURFACE = '#FFFFFF'
const BORDER = '#E8E2D9'

/**
 * Sign-in / sign-up form for the public "Save your intake to your account"
 * flow. On success, the action below links the user to the clinic as a
 * patient, switches the session's active org, then hard-navigates to
 * `/patient/intake` so middleware + tenant context see the new session
 * state on the next request.
 */
export default function IntakeStartForm({ orgId, clinicName, brand }: Props) {
  const [mode, setMode] = useState<Mode>('signup')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const isSignIn = mode === 'signin'

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setErrorMsg('')
    try {
      if (isSignIn) {
        const { error } = await authClient.signIn.email({
          email: email.trim(),
          password,
        })
        if (error) {
          setErrorMsg(error.message ?? 'Sign in failed. Check your password.')
          setSubmitting(false)
          return
        }
      } else {
        const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
        const { error } = (await signUp.email({
          email: email.trim(),
          name: fullName || email.trim(),
          password,
        } as never)) as { error?: { message?: string } | null }
        if (error) {
          setErrorMsg(error.message ?? 'Could not create account.')
          setSubmitting(false)
          return
        }
      }

      // Patient row + member row + session.activeOrganizationId switch.
      // For sign-in, derive a best-guess name from email if the user didn't
      // type it (the server only needs a row to point at; staff can fix
      // names later).
      const linkFirst = firstName.trim() || email.split('@')[0] || 'Patient'
      const linkLast = lastName.trim() || ''
      await linkUserToClinicAsPatient({
        orgId,
        firstName: linkFirst,
        lastName: linkLast || 'TBD',
        phone: phone.trim() || null,
      })

      // Hard navigate so middleware + tenant context pick up the new
      // session.activeOrganizationId on the next request. Soft router push
      // doesn't re-run middleware on session cookie changes.
      window.location.assign('/patient/intake')
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      )
      setSubmitting(false)
    }
  }

  const inputStyle = {
    backgroundColor: SURFACE,
    color: INK,
    border: `1px solid ${BORDER}`,
  } as const

  return (
    <div>
      {/* Mode toggle */}
      <div
        className="inline-flex items-center p-1 rounded-full mb-6"
        style={{ backgroundColor: '#F1ECE3' }}
      >
        <button
          type="button"
          onClick={() => setMode('signup')}
          className="px-4 py-1.5 rounded-full text-sm font-semibold transition"
          style={{
            backgroundColor: !isSignIn ? brand : 'transparent',
            color: !isSignIn ? '#FFFFFF' : INK_MUTED,
          }}
          aria-pressed={!isSignIn}
        >
          New patient
        </button>
        <button
          type="button"
          onClick={() => setMode('signin')}
          className="px-4 py-1.5 rounded-full text-sm font-semibold transition"
          style={{
            backgroundColor: isSignIn ? brand : 'transparent',
            color: isSignIn ? '#FFFFFF' : INK_MUTED,
          }}
          aria-pressed={isSignIn}
        >
          Have an account
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {!isSignIn && (
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              required
              type="text"
              autoComplete="given-name"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
              style={inputStyle}
            />
            <input
              required
              type="text"
              autoComplete="family-name"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
              style={inputStyle}
            />
          </div>
        )}
        <input
          required
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
          style={inputStyle}
        />
        {!isSignIn && (
          <input
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
            style={inputStyle}
          />
        )}
        <input
          required
          type="password"
          autoComplete={isSignIn ? 'current-password' : 'new-password'}
          minLength={8}
          placeholder={isSignIn ? 'Password' : 'Create a password (8+ chars)'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
          style={inputStyle}
        />

        {errorMsg && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-full text-base font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: brand }}
        >
          {submitting
            ? 'Just a moment…'
            : isSignIn
              ? `Sign in to ${clinicName}`
              : `Create account & start intake`}
        </button>
        <p className="text-xs text-center mt-2" style={{ color: INK_MUTED }}>
          {isSignIn
            ? 'Welcome back. We’ll take you straight to the intake form.'
            : 'After you sign up, we’ll take you to the intake form. Submissions save to your account so you can review later.'}
        </p>
      </form>
    </div>
  )
}
