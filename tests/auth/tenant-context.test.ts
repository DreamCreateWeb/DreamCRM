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
    demoCookie: null as string | null,
  },
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) =>
      name === 'demo_context' && state.demoCookie ? { name, value: state.demoCookie } : undefined,
  }),
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
          orderBy: () => chain,
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
  state.demoCookie = null
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

describe('getTenantContext — the view-as / demo split (2026-07-21)', () => {
  // The owner operates REAL clinics via "View as" during white-glove
  // onboarding. isDemo must follow the ORG (organization.is_demo), never the
  // view-as path itself — the old conflation demo-restricted real clinics
  // (hid domain buying, suppressed Zernio networking) exactly when he was
  // setting them up.
  const adminSession = {
    user: { id: 'admin1', email: 'dustin@x.com', name: 'Dustin', platformAdmin: true },
    session: { id: 'sess_a', activeOrganizationId: 'org_platform' },
  }

  it('view-as a REAL clinic → viaViewAs true, isDemo FALSE (full real behavior)', async () => {
    state.session = adminSession
    state.demoCookie = JSON.stringify({ orgId: 'org_real', role: 'owner' })
    state.organization = [[{ id: 'org_real', type: 'clinic', name: 'Mammoth Springs', slug: 'mammoth', isDemo: false }]]
    state.clinicProfile = [[{ planTier: 'premium' }]]
    const ctx = await getTenantContext()
    expect(ctx!.organizationId).toBe('org_real')
    expect(ctx!.viaViewAs).toBe(true)
    expect(ctx!.isDemo).toBe(false)
  })

  it('view-as the DEMO clinic → viaViewAs true AND isDemo true', async () => {
    state.session = adminSession
    state.demoCookie = JSON.stringify({ orgId: 'org_demo', role: 'owner' })
    state.organization = [[{ id: 'org_demo', type: 'clinic', name: 'Dream Dental', slug: 'acme-dental-demo', isDemo: true }]]
    state.clinicProfile = [[{ planTier: 'premium' }]]
    const ctx = await getTenantContext()
    expect(ctx!.isDemo).toBe(true)
    expect(ctx!.viaViewAs).toBe(true)
  })

  it('a real MEMBER of the demo org still counts as demo (flag follows the org)', async () => {
    state.session = {
      user: { id: 'u1', email: 'e@x.com', name: 'T', platformAdmin: false },
      session: { id: 's', activeOrganizationId: 'org_demo' },
    }
    state.member = [[{ role: 'owner', organizationId: 'org_demo', userId: 'u1' }]]
    state.organization = [[{ id: 'org_demo', type: 'clinic', name: 'Dream Dental', slug: 'acme-dental-demo', isDemo: true }]]
    state.clinicProfile = [[{ planTier: 'premium' }]]
    const ctx = await getTenantContext()
    expect(ctx!.isDemo).toBe(true)
    expect(ctx!.viaViewAs).toBe(false)
  })

  it('an ordinary member of a real clinic gets neither flag', async () => {
    state.session = {
      user: { id: 'u1', email: 'e@x.com', name: 'T', platformAdmin: false },
      session: { id: 's', activeOrganizationId: 'org_a' },
    }
    state.member = [[{ role: 'admin', organizationId: 'org_a', userId: 'u1' }]]
    state.organization = [[{ id: 'org_a', type: 'clinic', name: 'A Dental', slug: 'a-dental', isDemo: false }]]
    state.clinicProfile = [[{ planTier: 'pro' }]]
    const ctx = await getTenantContext()
    expect(ctx!.isDemo).toBe(false)
    expect(ctx!.viaViewAs).toBe(false)
  })
})
