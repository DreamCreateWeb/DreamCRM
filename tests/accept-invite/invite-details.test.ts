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
  // Account-state resolution (user + credential account row) — default empty.
  user: null as null | { id: string },
  account: null as null | { id: string },
}

vi.mock('@/lib/db', async () => {
  const { invitation, organization, user, account } = await import('@/lib/db/schema/auth')
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
              : table === user
                ? 'user'
                : table === account
                  ? 'account'
                  : 'unknown'
      return obj
    }
    obj.where = () => obj
    obj.limit = async () => {
      // resolveAccountState (called by getInvitationDetails) queries user +
      // account; default them empty → accountState 'none' unless a test sets them.
      if (obj._table === 'user') return stubs.user ? [stubs.user] : []
      if (obj._table === 'account') return stubs.account ? [stubs.account] : []
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
  stubs.user = null
  stubs.account = null
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
      // No user/account rows match in the mocked db → 'none' (create-account).
      accountState: 'none',
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

  describe('accountState resolution', () => {
    const pending = {
      email: 'a@x.com',
      role: 'member',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400_000),
      orgId: 'org_1',
    }

    it("'none' when no user exists for the invite email", async () => {
      stubs.invitation = pending
      stubs.org = { name: 'Acme' }
      stubs.user = null
      const result = await getInvitationDetails('tok')
      expect(result?.accountState).toBe('none')
    })

    it("'password' when a user exists WITH a credential account row", async () => {
      stubs.invitation = pending
      stubs.org = { name: 'Acme' }
      stubs.user = { id: 'u1' }
      stubs.account = { id: 'acct_cred' } // credential row present
      const result = await getInvitationDetails('tok')
      expect(result?.accountState).toBe('password')
    })

    it("'magic-link' when a user exists but has NO credential row", async () => {
      stubs.invitation = pending
      stubs.org = { name: 'Acme' }
      stubs.user = { id: 'u1' }
      stubs.account = null // no credential row → magic-link-only
      const result = await getInvitationDetails('tok')
      expect(result?.accountState).toBe('magic-link')
    })
  })
})
