import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression tests for getTenantContext membership resolution. The key
 * security property: a session whose activeOrganizationId points at an org the
 * user is NOT a member of (e.g. they were removed from the clinic) must never
 * resolve to a default 'member' context for that org.
 *
 * Mocks the session source + a per-table db queue so we can drive each path.
 */
const { state } = vi.hoisted(() => ({
  state: {
    session: null as unknown,
    member: [] as unknown[][],
    organization: [] as unknown[][],
    clinicProfile: [] as unknown[][],
    patient: [] as unknown[][],
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
          limit: async () => (tbl && Array.isArray(state[tbl]) ? (state[tbl] as unknown[][]).shift() ?? [] : []),
        }
        return chain
      },
    },
  }
})

import { getTenantContext } from '@/lib/auth/context'

beforeEach(() => {
  state.session = null
  state.member = []
  state.organization = []
  state.clinicProfile = []
  state.patient = []
})

const sessionFor = (activeOrganizationId: string | null) => ({
  user: { id: 'u1', email: 'e@x.com', name: 'Test User', platformAdmin: false },
  session: { id: 'sess_1', activeOrganizationId },
})

describe('getTenantContext — membership resolution', () => {
  it('returns null when not signed in', async () => {
    state.session = null
    expect(await getTenantContext()).toBeNull()
  })

  it('resolves a clinic context for a real member of the active org', async () => {
    state.session = sessionFor('org_a')
    state.member = [[{ role: 'admin', organizationId: 'org_a', userId: 'u1' }]]
    state.organization = [[{ id: 'org_a', type: 'clinic', name: 'A Dental', slug: 'a-dental' }]]
    state.clinicProfile = [[{ planTier: 'pro' }]]
    const ctx = await getTenantContext()
    expect(ctx).not.toBeNull()
    expect(ctx!.organizationId).toBe('org_a')
    expect(ctx!.role).toBe('admin')
    expect(ctx!.tenantType).toBe('clinic')
    expect(ctx!.planTier).toBe('pro')
  })

  it('surfaces subscriptionStatus from the clinic_profile row (drives the dunning banner)', async () => {
    state.session = sessionFor('org_a')
    state.member = [[{ role: 'owner', organizationId: 'org_a', userId: 'u1' }]]
    state.organization = [[{ id: 'org_a', type: 'clinic', name: 'A Dental', slug: 'a-dental' }]]
    state.clinicProfile = [[{ planTier: 'pro', subscriptionStatus: 'past_due' }]]
    const ctx = await getTenantContext()
    expect(ctx!.subscriptionStatus).toBe('past_due')
  })

  it('leaves subscriptionStatus null when the clinic has no subscription on file', async () => {
    state.session = sessionFor('org_a')
    state.member = [[{ role: 'owner', organizationId: 'org_a', userId: 'u1' }]]
    state.organization = [[{ id: 'org_a', type: 'clinic', name: 'A Dental', slug: 'a-dental' }]]
    state.clinicProfile = [[{ planTier: 'basic' }]]
    const ctx = await getTenantContext()
    expect(ctx!.subscriptionStatus ?? null).toBeNull()
  })

  it('does NOT grant access to a stale active org the user was removed from — falls back to a real membership', async () => {
    state.session = sessionFor('org_gone')
    // No member row in org_gone (removed); first real membership is org_real.
    state.member = [[], [{ role: 'member', organizationId: 'org_real', userId: 'u1' }]]
    state.organization = [[{ id: 'org_real', type: 'clinic', name: 'Real Dental', slug: 'real' }]]
    state.clinicProfile = [[]]
    const ctx = await getTenantContext()
    expect(ctx).not.toBeNull()
    // The critical assertion: the resolved org is NOT the stale org_gone.
    expect(ctx!.organizationId).toBe('org_real')
    expect(ctx!.role).toBe('member')
  })

  it('returns null when the user has no memberships at all', async () => {
    state.session = sessionFor('org_gone')
    state.member = [[], []] // none in the active org, none anywhere
    expect(await getTenantContext()).toBeNull()
  })
})
