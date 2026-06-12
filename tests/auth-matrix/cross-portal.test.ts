import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * requirePartner — cross-portal reachability. The key property: a partner who
 * is ALSO a platform admin or clinic staffer (one email = one user, so
 * getTenantContext resolves their MEMBERSHIP tenancy, NOT 'partner') must still
 * be authorized for partner surfaces, because requirePartner authorizes by a
 * referral_partner.user_id lookup — not tenantType.
 */
const { state } = vi.hoisted(() => ({
  state: {
    session: null as unknown,
    member: [] as unknown[][],
    organization: [] as unknown[][],
    clinicProfile: [] as unknown[][],
    patient: [] as unknown[][],
    partner: null as null | { id: string; status: string; name: string },
  },
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock('@/lib/auth/server', () => ({
  auth: { api: { getSession: async () => state.session } },
}))
vi.mock('@/lib/db', async () => {
  const auth = await import('@/lib/db/schema/auth')
  const platform = await import('@/lib/db/schema/platform')
  const clinic = await import('@/lib/db/schema/clinic')
  const nameOf = (t: unknown): keyof typeof state | '' =>
    t === auth.member ? 'member'
      : t === auth.organization ? 'organization'
        : t === platform.clinicProfile ? 'clinicProfile'
          : t === clinic.patient ? 'patient'
            : ''
  return {
    db: {
      select: () => {
        let tbl: keyof typeof state | '' = ''
        const chain: Record<string, unknown> = {
          from: (t: unknown) => {
            tbl = nameOf(t)
            return chain
          },
          where: () => chain,
          limit: async () =>
            tbl && Array.isArray(state[tbl]) ? (state[tbl] as unknown[][]).shift() ?? [] : [],
        }
        return chain
      },
    },
  }
})
// requirePartner dynamically imports the referrals service for the partner row.
vi.mock('@/lib/services/referrals', () => ({
  getPartnerByUserId: vi.fn(async () => state.partner),
}))
// redirect throws a tagged error so we can assert the "sent home" path.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import { requirePartner } from '@/lib/auth/context'

beforeEach(() => {
  state.session = null
  state.member = []
  state.organization = []
  state.clinicProfile = []
  state.patient = []
  state.partner = null
})

const platformAdminSession = () => ({
  user: { id: 'u1', email: 'founder@x.com', name: 'Founder', platformAdmin: true },
  session: { id: 's1', activeOrganizationId: 'org_platform' },
})

describe('requirePartner — multi-persona reachability', () => {
  it('authorizes a partner who is ALSO a platform admin (membership tenancy is platform)', async () => {
    state.session = platformAdminSession()
    // getTenantContext resolves a platform membership → tenantType 'platform'.
    state.member = [[{ role: 'owner', organizationId: 'org_platform', userId: 'u1' }]]
    state.organization = [[{ id: 'org_platform', type: 'platform', name: 'Dream Create', slug: 'dc' }]]
    // …but the user is also an active partner.
    state.partner = { id: 'p1', status: 'active', name: 'Founder Consulting' }

    const { ctx, partner } = await requirePartner()
    expect(ctx.tenantType).toBe('platform') // tenancy unchanged
    expect(partner.id).toBe('p1') // …yet partner access is granted
  })

  it('authorizes a partner who is ALSO clinic staff (membership tenancy is clinic)', async () => {
    state.session = {
      user: { id: 'u1', email: 'staff@x.com', name: 'Staffer', platformAdmin: false },
      session: { id: 's1', activeOrganizationId: 'org_a' },
    }
    state.member = [[{ role: 'admin', organizationId: 'org_a', userId: 'u1' }]]
    state.organization = [[{ id: 'org_a', type: 'clinic', name: 'A Dental', slug: 'a' }]]
    state.clinicProfile = [[{ planTier: 'pro' }]]
    state.partner = { id: 'p1', status: 'active', name: 'Side Hustle' }

    const { ctx, partner } = await requirePartner()
    expect(ctx.tenantType).toBe('clinic')
    expect(partner.id).toBe('p1')
  })

  it('redirects home when the user is not a partner', async () => {
    state.session = platformAdminSession()
    state.member = [[{ role: 'owner', organizationId: 'org_platform', userId: 'u1' }]]
    state.organization = [[{ id: 'org_platform', type: 'platform', name: 'Dream Create', slug: 'dc' }]]
    state.partner = null
    await expect(requirePartner()).rejects.toThrow('REDIRECT:/')
  })

  it('redirects home when the partner row is not active (invited/suspended)', async () => {
    state.session = platformAdminSession()
    state.member = [[{ role: 'owner', organizationId: 'org_platform', userId: 'u1' }]]
    state.organization = [[{ id: 'org_platform', type: 'platform', name: 'Dream Create', slug: 'dc' }]]
    state.partner = { id: 'p1', status: 'invited', name: 'Pending Partner' }
    await expect(requirePartner()).rejects.toThrow('REDIRECT:/')
  })

  it('throws (not redirect) when redirectOnFail is false (server-action mode)', async () => {
    state.session = platformAdminSession()
    state.member = [[{ role: 'owner', organizationId: 'org_platform', userId: 'u1' }]]
    state.organization = [[{ id: 'org_platform', type: 'platform', name: 'Dream Create', slug: 'dc' }]]
    state.partner = null
    await expect(requirePartner({ redirectOnFail: false })).rejects.toThrow(/active partner account required/i)
  })
})
