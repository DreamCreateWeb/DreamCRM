import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Magic-link no-user fallback + active-org resolver, the two
 * lib/auth/server.ts helpers that fix the portal-onboarding dead-ends.
 *
 * We mock better-auth's surface so importing the module doesn't try to build
 * a real auth instance, and stub the DB per-table.
 */

vi.mock('better-auth', () => ({ betterAuth: vi.fn(() => ({})) }))
vi.mock('better-auth/adapters/drizzle', () => ({ drizzleAdapter: vi.fn(() => ({})) }))
vi.mock('better-auth/plugins', () => ({ organization: vi.fn(() => ({})), magicLink: vi.fn(() => ({})) }))
vi.mock('better-auth/next-js', () => ({ nextCookies: vi.fn(() => ({})) }))

const sendMagicLinkEmail = vi.fn(async () => {})
const sendPatientPortalInviteEmail = vi.fn(async () => {})
vi.mock('@/lib/email', () => ({
  sendInvitationEmail: vi.fn(),
  sendMagicLinkEmail: (...a: unknown[]) => sendMagicLinkEmail(...(a as [])),
  sendPatientPortalInviteEmail: (...a: unknown[]) => sendPatientPortalInviteEmail(...(a as [])),
  sendPasswordResetEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
}))

// Per-table stub state.
const stub = {
  user: null as null | { id: string },
  patient: null as null | { id: string; organizationId: string; firstName: string },
  pendingInvite: null as null | { id: string },
  staffMember: null as null | { userId: string },
  clinicProfile: null as null | { displayName: string | null },
  org: null as null | { name: string },
  memberships: [] as Array<{ organizationId: string; role: string; createdAt: Date }>,
}
const inserts: Array<Record<string, unknown>> = []

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema/auth')
  const { patient } = await import('@/lib/db/schema/clinic')
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const which = (t: unknown): string => {
    if (t === schema.user) return 'user'
    if (t === patient) return 'patient'
    if (t === schema.invitation) return 'invitation'
    if (t === schema.member) return 'member'
    if (t === clinicProfile) return 'clinicProfile'
    if (t === schema.organization) return 'organization'
    return 'unknown'
  }
  const chain = () => {
    const obj: any = {}
    let table = 'unknown'
    obj.from = (t: unknown) => {
      table = which(t)
      return obj
    }
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => {
      switch (table) {
        case 'user':
          return stub.user ? [stub.user] : []
        case 'patient':
          return stub.patient ? [stub.patient] : []
        case 'invitation':
          return stub.pendingInvite ? [stub.pendingInvite] : []
        case 'member':
          return stub.staffMember ? [stub.staffMember] : []
        case 'clinicProfile':
          return stub.clinicProfile ? [stub.clinicProfile] : []
        case 'organization':
          return stub.org ? [stub.org] : []
        default:
          return []
      }
    }
    // member-list path for resolveDefaultActiveOrg awaits where() directly.
    obj.then = (resolve: (v: unknown) => void) => resolve(table === 'member' ? stub.memberships : [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({ values: async (v: Record<string, unknown>) => { inserts.push(v) } }),
    },
  }
})

import { maybeSendPortalInviteForMagicLink, resolveDefaultActiveOrg } from '@/lib/auth/server'

beforeEach(() => {
  stub.user = null
  stub.patient = null
  stub.pendingInvite = null
  stub.staffMember = null
  stub.clinicProfile = null
  stub.org = null
  stub.memberships = []
  inserts.length = 0
  sendMagicLinkEmail.mockClear()
  sendPatientPortalInviteEmail.mockClear()
})

describe('maybeSendPortalInviteForMagicLink', () => {
  it('returns false (no fallback) when a user account already exists', async () => {
    stub.user = { id: 'u_1' }
    stub.patient = { id: 'pat_1', organizationId: 'org_1', firstName: 'Jane' }
    const sent = await maybeSendPortalInviteForMagicLink('jane@x.com')
    expect(sent).toBe(false)
    expect(sendPatientPortalInviteEmail).not.toHaveBeenCalled()
  })

  it('sends a portal invite when there is no user but a patient row exists', async () => {
    stub.user = null
    stub.patient = { id: 'pat_1', organizationId: 'org_1', firstName: 'Jane' }
    stub.staffMember = { userId: 'u_staff' }
    stub.org = { name: 'Acme Dental' }
    const sent = await maybeSendPortalInviteForMagicLink('jane@x.com')
    expect(sent).toBe(true)
    expect(sendPatientPortalInviteEmail).toHaveBeenCalledTimes(1)
    // A new pending invitation was created.
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({ role: 'patient', email: 'jane@x.com' })
  })

  it('returns false silently when no user AND no patient row (no enumeration)', async () => {
    stub.user = null
    stub.patient = null
    const sent = await maybeSendPortalInviteForMagicLink('ghost@x.com')
    expect(sent).toBe(false)
    expect(sendPatientPortalInviteEmail).not.toHaveBeenCalled()
    expect(inserts).toHaveLength(0)
  })

  it('reuses an existing pending invite instead of creating a new row', async () => {
    stub.user = null
    stub.patient = { id: 'pat_1', organizationId: 'org_1', firstName: 'Jane' }
    stub.pendingInvite = { id: 'inv_existing' }
    stub.org = { name: 'Acme Dental' }
    const sent = await maybeSendPortalInviteForMagicLink('jane@x.com')
    expect(sent).toBe(true)
    expect(inserts).toHaveLength(0) // reused, not inserted
    expect(sendPatientPortalInviteEmail).toHaveBeenCalledTimes(1)
  })

  it('returns false on an empty email', async () => {
    expect(await maybeSendPortalInviteForMagicLink('')).toBe(false)
  })
})

describe('resolveDefaultActiveOrg', () => {
  it('returns null when the user has no memberships', async () => {
    stub.memberships = []
    expect(await resolveDefaultActiveOrg('u_1')).toBeNull()
  })

  it('returns the sole membership org', async () => {
    stub.memberships = [{ organizationId: 'org_solo', role: 'patient', createdAt: new Date() }]
    expect(await resolveDefaultActiveOrg('u_1')).toBe('org_solo')
  })

  it('prefers the most recent patient-role membership when there are several', async () => {
    stub.memberships = [
      { organizationId: 'org_staff', role: 'admin', createdAt: new Date('2026-01-01') },
      { organizationId: 'org_old_portal', role: 'patient', createdAt: new Date('2026-02-01') },
      { organizationId: 'org_new_portal', role: 'patient', createdAt: new Date('2026-05-01') },
    ]
    expect(await resolveDefaultActiveOrg('u_1')).toBe('org_new_portal')
  })

  it('returns null for ambiguous staff-in-many-orgs (no patient membership)', async () => {
    stub.memberships = [
      { organizationId: 'org_a', role: 'admin', createdAt: new Date('2026-01-01') },
      { organizationId: 'org_b', role: 'owner', createdAt: new Date('2026-02-01') },
    ]
    expect(await resolveDefaultActiveOrg('u_1')).toBeNull()
  })
})
