import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * getTenantContext 'partner' derivation. A user with NO org membership but an
 * active referral_partner row resolves to a 'partner' tenant. Precedence:
 * platformAdmins + clinic members keep their tenancy (the partner check runs
 * only when no membership resolves).
 */
const { state } = vi.hoisted(() => ({
  state: {
    session: null as unknown,
    member: [] as unknown[][],
    organization: [] as unknown[][],
    clinicProfile: [] as unknown[][],
    patient: [] as unknown[][],
    referralPartner: [] as unknown[][],
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
  const referrals = await import('@/lib/db/schema/referrals')
  const nameOf = (t: unknown): keyof typeof state | '' =>
    t === auth.member ? 'member'
      : t === auth.organization ? 'organization'
        : t === platform.clinicProfile ? 'clinicProfile'
          : t === clinic.patient ? 'patient'
            : t === referrals.referralPartner ? 'referralPartner'
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
  state.referralPartner = []
})

const sessionFor = (opts: { activeOrganizationId?: string | null; platformAdmin?: boolean } = {}) => ({
  user: { id: 'u1', email: 'partner@x.com', name: 'Partner Person', platformAdmin: opts.platformAdmin ?? false },
  session: { id: 'sess_1', activeOrganizationId: opts.activeOrganizationId ?? null },
})

describe('getTenantContext — partner derivation', () => {
  it('derives a partner context when the user has no membership but an active partner row', async () => {
    state.session = sessionFor()
    state.member = [[], []] // none in active org, none anywhere
    state.referralPartner = [[{ id: 'p1', status: 'active', name: 'Brightline IT' }]]
    const ctx = await getTenantContext()
    expect(ctx).not.toBeNull()
    expect(ctx!.tenantType).toBe('partner')
    expect(ctx!.organizationId).toBe('p1')
    expect(ctx!.organizationName).toBe('Brightline IT')
    expect(ctx!.role).toBe('member')
  })

  it('does NOT derive a partner context for a non-active (invited/suspended) partner', async () => {
    state.session = sessionFor()
    state.member = [[], []]
    state.referralPartner = [[{ id: 'p1', status: 'invited', name: 'Brightline IT' }]]
    expect(await getTenantContext()).toBeNull()
  })

  it('returns null when there is no membership AND no partner row', async () => {
    state.session = sessionFor()
    state.member = [[], []]
    state.referralPartner = [[]]
    expect(await getTenantContext()).toBeNull()
  })

  it('precedence: a clinic member is a clinic tenant even if a partner row also exists', async () => {
    state.session = sessionFor({ activeOrganizationId: 'org_a' })
    // Membership resolves → partner check never runs.
    state.member = [[{ role: 'admin', organizationId: 'org_a', userId: 'u1' }]]
    state.organization = [[{ id: 'org_a', type: 'clinic', name: 'A Dental', slug: 'a-dental' }]]
    state.clinicProfile = [[{ planTier: 'pro' }]]
    const ctx = await getTenantContext()
    expect(ctx!.tenantType).toBe('clinic')
    expect(ctx!.organizationId).toBe('org_a')
  })
})
