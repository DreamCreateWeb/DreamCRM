import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * The clinic-scoped patient sign-in/sign-up form, in its two purposes:
 *  - 'intake' (default) → intake-framed copy, lands on /patient/intake
 *  - 'portal'           → portal-framed copy, lands on /patient/dashboard
 * Plus the clinicPortalSignInUrl helper that the public site links at (the
 * fix: patient "Login" must reach the clinic portal, never the platform login).
 */

vi.mock('@/lib/auth/client', () => ({
  authClient: { signIn: { email: vi.fn(async () => ({ error: null })) } },
  signUp: { email: vi.fn(async () => ({ error: null })) },
}))
vi.mock('@/app/site/[slug]/intake-start/actions', () => ({
  linkUserToClinicAsPatient: vi.fn(async () => ({ ok: true as const, data: null })),
}))

import IntakeStartForm from '@/app/site/[slug]/intake-start/intake-start-form'
import { clinicPortalSignInUrl } from '@/lib/services/clinic-site'

describe('clinicPortalSignInUrl', () => {
  it('builds an absolute clinic-portal URL (never the platform /signin)', () => {
    const url = clinicPortalSignInUrl('acme-dental')
    expect(url).toMatch(/^https?:\/\/.+\/site\/acme-dental\/portal$/)
    expect(url.endsWith('/signin')).toBe(false)
  })

  it('url-encodes the slug', () => {
    expect(clinicPortalSignInUrl('a b')).toContain('/site/a%20b/portal')
  })

  // Settings → Patient portal → Sign-in: a clinic that keeps its PMS vendor's
  // portal points every "Patient login" there. The stored blob is passed raw.
  it('goes to the clinic\'s external portal when they chose one', () => {
    const stored = { login: { destination: 'external', externalUrl: 'https://portal.modento.io/acme' } }
    expect(clinicPortalSignInUrl('acme-dental', stored)).toBe('https://portal.modento.io/acme')
  })

  it('stays on our portal when the external choice is unusable or absent', () => {
    expect(clinicPortalSignInUrl('acme-dental', null)).toMatch(/\/site\/acme-dental\/portal$/)
    expect(clinicPortalSignInUrl('acme-dental', { login: { destination: 'external', externalUrl: '' } })).toMatch(
      /\/site\/acme-dental\/portal$/,
    )
    expect(
      clinicPortalSignInUrl('acme-dental', { login: { destination: 'dreamcrm', externalUrl: 'https://portal.modento.io/acme' } }),
    ).toMatch(/\/site\/acme-dental\/portal$/)
  })
})

describe('IntakeStartForm — purpose="portal"', () => {
  it('shows portal-framed copy and a generic create-account CTA', () => {
    render(<IntakeStartForm orgId="o" clinicName="Acme Dental" brand="#2A7F8C" purpose="portal" />)
    // New-patient (signup) is the default mode.
    expect(screen.getByRole('button', { name: 'Create your account' })).toBeTruthy()
    expect(screen.getByText(/see your visits, forms, and messages/i)).toBeTruthy()
    // Toggle to sign-in.
    fireEvent.click(screen.getByRole('button', { name: /Have an account/i }))
    expect(screen.getByRole('button', { name: 'Sign in to Acme Dental' })).toBeTruthy()
    expect(screen.getByText(/take you to your patient portal/i)).toBeTruthy()
  })
})

describe('IntakeStartForm — purpose="intake" (default)', () => {
  it('keeps the intake-framed CTA + copy', () => {
    render(<IntakeStartForm orgId="o" clinicName="Acme Dental" brand="#2A7F8C" />)
    expect(screen.getByRole('button', { name: 'Create account & start intake' })).toBeTruthy()
    expect(screen.getByText(/take you to the intake form/i)).toBeTruthy()
  })
})
