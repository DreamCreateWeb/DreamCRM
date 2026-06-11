import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * maybeClinicSenderForEmail — magic-link emails wear the patient's CLINIC brand.
 * Looks up the most-recent active patient row for the email (any org) and
 * resolves that clinic's sender identity; returns null for staff (no patient
 * row) so the platform-branded fallback copy is used.
 */

vi.mock('better-auth', () => ({ betterAuth: vi.fn(() => ({})) }))
vi.mock('better-auth/adapters/drizzle', () => ({ drizzleAdapter: vi.fn(() => ({})) }))
vi.mock('better-auth/plugins', () => ({ organization: vi.fn(() => ({})), magicLink: vi.fn(() => ({})) }))
vi.mock('better-auth/next-js', () => ({ nextCookies: vi.fn(() => ({})) }))
vi.mock('@/lib/email', () => ({
  sendInvitationEmail: vi.fn(),
  sendMagicLinkEmail: vi.fn(),
  sendPatientPortalInviteEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendChangeEmailVerification: vi.fn(),
}))

const stub = { patient: null as null | { organizationId: string } }

vi.mock('@/lib/db', async () => {
  const { patient } = await import('@/lib/db/schema/clinic')
  const chain = () => {
    const obj: any = {}
    let table = 'unknown'
    obj.from = (t: unknown) => { table = t === patient ? 'patient' : 'unknown'; return obj }
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => (table === 'patient' && stub.patient ? [stub.patient] : [])
    return obj
  }
  return { db: { select: () => chain() } }
})

const getClinicSenderIdentity = vi.fn(async (orgId: string) => ({
  name: 'Acme Dental',
  from: 'Acme Dental <acme-dental@dreamcreatestudio.com>',
  replyTo: 'hello@acme.com',
  timeZone: 'America/New_York',
  _orgId: orgId,
}))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity }))

import { maybeClinicSenderForEmail } from '@/lib/auth/server'

beforeEach(() => {
  stub.patient = null
  getClinicSenderIdentity.mockClear()
})

describe('maybeClinicSenderForEmail', () => {
  it('returns the clinic sender identity when a patient row matches the email', async () => {
    stub.patient = { organizationId: 'org_acme' }
    const sender = await maybeClinicSenderForEmail('jane@x.com')
    expect(getClinicSenderIdentity).toHaveBeenCalledWith('org_acme')
    expect(sender).not.toBeNull()
    expect(sender!.name).toBe('Acme Dental')
    expect(sender!.from).toContain('acme-dental@dreamcreatestudio.com')
  })

  it('returns null (platform fallback) when no patient row matches', async () => {
    stub.patient = null
    const sender = await maybeClinicSenderForEmail('staff@dreamcreateweb.com')
    expect(sender).toBeNull()
    expect(getClinicSenderIdentity).not.toHaveBeenCalled()
  })

  it('returns null on an empty email (no lookup)', async () => {
    const sender = await maybeClinicSenderForEmail('')
    expect(sender).toBeNull()
    expect(getClinicSenderIdentity).not.toHaveBeenCalled()
  })

  it('returns null (never throws) when the identity resolver fails', async () => {
    stub.patient = { organizationId: 'org_acme' }
    getClinicSenderIdentity.mockRejectedValueOnce(new Error('db down'))
    const sender = await maybeClinicSenderForEmail('jane@x.com')
    expect(sender).toBeNull()
  })
})
