import { describe, it, expect, vi, beforeEach } from 'vitest'

const stubs = {
  invitation: null as null | {
    email: string
    role: string | null
    status: string
    expiresAt: Date
    orgId: string
  },
  org: null as null | { name: string; type?: string },
  clinicProfile: null as null | { displayName: string | null; logoUrl: string | null; brandColor: string | null },
}

vi.mock('@/lib/db', async () => {
  const { invitation, organization } = await import('@/lib/db/schema/auth')
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const chain = (fn: () => unknown) => {
    const obj: any = {}
    obj.from = (table: unknown) => {
      obj._table =
        table === invitation
          ? 'invitation'
          : table === organization
            ? 'organization'
            : table === clinicProfile
              ? 'clinicProfile'
              : 'unknown'
      return obj
    }
    obj.where = () => obj
    obj.limit = async () => {
      const out =
        obj._table === 'invitation'
          ? stubs.invitation
          : obj._table === 'clinicProfile'
            ? stubs.clinicProfile
            : stubs.org
      return out ? [out] : []
    }
    return obj
  }
  return { db: { select: () => chain(() => null) } }
})

import { getInvitationDetails } from '@/app/(auth)/accept-invite/invite-details'

beforeEach(() => {
  stubs.invitation = null
  stubs.org = null
  stubs.clinicProfile = null
})

describe('getInvitationDetails', () => {
  it('returns null for an unknown token', async () => {
    const result = await getInvitationDetails('nope')
    expect(result).toBeNull()
  })

  it('marks expired=true when status is accepted', async () => {
    stubs.invitation = {
      email: 'a@x.com',
      role: 'member',
      status: 'accepted',
      expiresAt: new Date(Date.now() + 86400_000),
      orgId: 'org_1',
    }
    stubs.org = { name: 'Acme' }
    const result = await getInvitationDetails('tok')
    expect(result?.expired).toBe(true)
  })

  it('marks expired=true when status is canceled (better-auth cancelInvitation)', async () => {
    stubs.invitation = {
      email: 'a@x.com',
      role: 'member',
      status: 'canceled',
      expiresAt: new Date(Date.now() + 86400_000),
      orgId: 'org_1',
    }
    stubs.org = { name: 'Acme' }
    const result = await getInvitationDetails('tok')
    expect(result?.expired).toBe(true)
  })

  it('marks expired=true when status is rejected', async () => {
    stubs.invitation = {
      email: 'a@x.com',
      role: 'member',
      status: 'rejected',
      expiresAt: new Date(Date.now() + 86400_000),
      orgId: 'org_1',
    }
    stubs.org = { name: 'Acme' }
    const result = await getInvitationDetails('tok')
    expect(result?.expired).toBe(true)
  })

  it('marks expired=true when expiresAt has passed', async () => {
    stubs.invitation = {
      email: 'a@x.com',
      role: 'member',
      status: 'pending',
      expiresAt: new Date(Date.now() - 1000),
      orgId: 'org_1',
    }
    stubs.org = { name: 'Acme' }
    const result = await getInvitationDetails('tok')
    expect(result?.expired).toBe(true)
  })

  it('returns full details for valid pending invitation (platform/staff org → no brand)', async () => {
    stubs.invitation = {
      email: 'a@x.com',
      role: 'admin',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400_000),
      orgId: 'org_1',
    }
    stubs.org = { name: 'Acme Dental', type: 'platform' }
    const result = await getInvitationDetails('tok')
    expect(result).toEqual({
      email: 'a@x.com',
      orgName: 'Acme Dental',
      role: 'admin',
      expired: false,
      orgType: 'platform',
      brand: null,
    })
  })

  it('attaches clinic branding for a clinic-org patient invite', async () => {
    stubs.invitation = {
      email: 'patient@x.com',
      role: 'patient',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400_000),
      orgId: 'org_clinic',
    }
    stubs.org = { name: 'Acme Dental', type: 'clinic' }
    stubs.clinicProfile = { displayName: 'Acme Family Dental', logoUrl: 'https://x/logo.png', brandColor: '#2563eb' }
    const result = await getInvitationDetails('tok')
    expect(result?.orgType).toBe('clinic')
    // displayName wins over the org name for the patient-facing label.
    expect(result?.orgName).toBe('Acme Family Dental')
    expect(result?.brand).toEqual({
      displayName: 'Acme Family Dental',
      logoUrl: 'https://x/logo.png',
      brandColor: '#2563eb',
    })
  })

  it('falls back to "member" role when invitation.role is null', async () => {
    stubs.invitation = {
      email: 'a@x.com',
      role: null,
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400_000),
      orgId: 'org_1',
    }
    stubs.org = { name: 'Acme' }
    const result = await getInvitationDetails('tok')
    expect(result?.role).toBe('member')
  })

  it('returns empty orgName when org row is missing (edge case)', async () => {
    stubs.invitation = {
      email: 'a@x.com',
      role: 'member',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400_000),
      orgId: 'org_1',
    }
    stubs.org = null
    const result = await getInvitationDetails('tok')
    expect(result?.orgName).toBe('')
  })
})
