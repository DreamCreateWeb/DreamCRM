import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE CALLER PERSONA MATRIX (P-02).
 *
 *   - getTenantContext derives 'caller' ONLY when the user has no org
 *     membership and holds an ACTIVE prospect_caller row; a platform admin
 *     is never a caller; a partner row wins over a caller row.
 *   - requireCaller authorizes by a DIRECT prospect_caller.user_id lookup:
 *     a clinic member, a partner, a patient and a non-caller are refused
 *     (redirected home, or thrown in action mode); a paused / archived
 *     caller is refused unless the surface asks allowInactive.
 *   - homePathFor sends a caller who types /dashboard to /calls (the shell
 *     and every (default) page read it).
 */
const { state } = vi.hoisted(() => ({
  state: {
    session: null as unknown,
    member: [] as unknown[][],
    organization: [] as unknown[][],
    clinicProfile: [] as unknown[][],
    patient: [] as unknown[][],
    referralPartner: [] as unknown[][],
    prospectCaller: [] as unknown[][],
    callerRow: null as null | { id: string; status: string; name: string; userId: string },
    partnerRow: null as null | { id: string; status: string; name: string },
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
  const prospecting = await import('@/lib/db/schema/prospecting')
  const nameOf = (t: unknown): keyof typeof state | '' =>
    t === auth.member ? 'member'
      : t === auth.organization ? 'organization'
        : t === platform.clinicProfile ? 'clinicProfile'
          : t === clinic.patient ? 'patient'
            : t === referrals.referralPartner ? 'referralPartner'
              : t === prospecting.prospectCaller ? 'prospectCaller'
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
vi.mock('@/lib/services/referrals', () => ({
  getPartnerByUserId: vi.fn(async () => state.partnerRow),
}))
vi.mock('@/lib/services/prospect-callers', () => ({
  getCallerByUserId: vi.fn(async () => state.callerRow),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import { getTenantContext, requireCaller, requirePartner } from '@/lib/auth/context'
import { homePathFor } from '@/lib/tenant-chrome'

beforeEach(() => {
  state.session = null
  state.member = []
  state.organization = []
  state.clinicProfile = []
  state.patient = []
  state.referralPartner = []
  state.prospectCaller = []
  state.callerRow = null
  state.partnerRow = null
})

const sessionFor = (opts: { activeOrganizationId?: string | null; platformAdmin?: boolean; email?: string } = {}) => ({
  user: {
    id: 'u1',
    email: opts.email ?? 'caller@x.com',
    name: 'Priya Nair',
    platformAdmin: opts.platformAdmin ?? false,
    twoFactorEnabled: true,
  },
  session: { id: 'sess_1', activeOrganizationId: opts.activeOrganizationId ?? null },
})

describe('getTenantContext — caller derivation', () => {
  it('derives a caller context: no membership + an ACTIVE prospect_caller row', async () => {
    state.session = sessionFor()
    state.member = [[], []]
    state.referralPartner = [[]]
    state.prospectCaller = [[{ id: 'pcal_1', status: 'active', name: 'Priya Nair' }]]
    const ctx = await getTenantContext()
    expect(ctx?.tenantType).toBe('caller')
    expect(ctx?.organizationId).toBe('pcal_1') // a pcal_ id — never an org
    expect(ctx?.organizationName).toBe('Priya Nair')
    expect(ctx?.role).toBe('member')
    expect(ctx?.platformAdmin).toBe(false)
    expect(ctx?.patientId).toBeNull()
  })

  it('never derives a caller for a paused / invited / archived row', async () => {
    for (const status of ['invited', 'paused', 'archived']) {
      state.session = sessionFor()
      state.member = [[], []]
      state.referralPartner = [[]]
      state.prospectCaller = [[{ id: 'pcal_1', status, name: 'Priya Nair' }]]
      expect(await getTenantContext(), status).toBeNull()
    }
  })

  it('a partner row wins over a caller row (an existing persona keeps its home)', async () => {
    state.session = sessionFor()
    state.member = [[], []]
    state.referralPartner = [[{ id: 'rp_1', status: 'active', name: 'Brightline IT' }]]
    state.prospectCaller = [[{ id: 'pcal_1', status: 'active', name: 'Priya Nair' }]]
    const ctx = await getTenantContext()
    expect(ctx?.tenantType).toBe('partner')
  })

  it('a clinic member is a clinic tenant even with a caller row — membership wins', async () => {
    state.session = sessionFor({ activeOrganizationId: 'org_a' })
    state.member = [[{ role: 'admin', organizationId: 'org_a', userId: 'u1' }]]
    state.organization = [[{ id: 'org_a', type: 'clinic', name: 'A Dental', slug: 'a-dental' }]]
    state.clinicProfile = [[{ planTier: 'pro' }]]
    state.prospectCaller = [[{ id: 'pcal_1', status: 'active', name: 'Priya Nair' }]]
    const ctx = await getTenantContext()
    expect(ctx?.tenantType).toBe('clinic')
  })

  it('a platform admin is NEVER a caller, even with no membership', async () => {
    state.session = sessionFor({ platformAdmin: true })
    state.member = [[], []]
    state.referralPartner = [[]]
    state.prospectCaller = [[{ id: 'pcal_1', status: 'active', name: 'Priya Nair' }]]
    expect(await getTenantContext()).toBeNull()
  })
})

describe('requireCaller — who reaches /calls', () => {
  const activeCaller = { id: 'pcal_1', status: 'active', name: 'Priya Nair', userId: 'u1' }

  function asCaller() {
    state.session = sessionFor()
    state.member = [[], []]
    state.referralPartner = [[]]
    state.prospectCaller = [[{ id: 'pcal_1', status: 'active', name: 'Priya Nair' }]]
    state.callerRow = activeCaller
  }

  it('an active caller reaches their queue — and ONLY a pcal_ id rides the context', async () => {
    asCaller()
    const { ctx, caller } = await requireCaller()
    expect(ctx.tenantType).toBe('caller')
    expect(caller.id).toBe('pcal_1')
    expect(ctx.organizationId).toMatch(/^pcal_/)
  })

  it('a clinic member is refused (sent home)', async () => {
    state.session = sessionFor({ activeOrganizationId: 'org_a' })
    state.member = [[{ role: 'admin', organizationId: 'org_a', userId: 'u1' }]]
    state.organization = [[{ id: 'org_a', type: 'clinic', name: 'A Dental', slug: 'a' }]]
    state.clinicProfile = [[{ planTier: 'pro' }]]
    state.callerRow = null
    await expect(requireCaller()).rejects.toThrow('REDIRECT:/')
  })

  it('a patient is refused (sent home)', async () => {
    state.session = sessionFor({ activeOrganizationId: 'org_a' })
    state.member = [[{ role: 'patient', organizationId: 'org_a', userId: 'u1' }]]
    state.organization = [[{ id: 'org_a', type: 'clinic', name: 'A Dental', slug: 'a' }]]
    state.clinicProfile = [[{ planTier: 'pro' }]]
    state.patient = [[{ id: 'pat_1' }]]
    state.callerRow = null
    await expect(requireCaller()).rejects.toThrow('REDIRECT:/')
  })

  it('a partner is refused (sent home) — and a caller is refused by requirePartner', async () => {
    state.session = sessionFor()
    state.member = [[], []]
    state.referralPartner = [[{ id: 'rp_1', status: 'active', name: 'Brightline IT' }]]
    state.partnerRow = { id: 'rp_1', status: 'active', name: 'Brightline IT' }
    state.callerRow = null
    await expect(requireCaller()).rejects.toThrow('REDIRECT:/')

    asCaller()
    state.partnerRow = null
    await expect(requirePartner()).rejects.toThrow('REDIRECT:/')
  })

  it('an anonymous visitor is sent to sign in', async () => {
    state.session = null
    await expect(requireCaller()).rejects.toThrow('REDIRECT:/signin')
  })

  it('a paused / archived caller is refused by default and resolved with allowInactive', async () => {
    for (const status of ['paused', 'archived']) {
      state.session = sessionFor()
      state.member = [[], []]
      state.referralPartner = [[]]
      state.prospectCaller = [[{ id: 'pcal_1', status: 'active', name: 'Priya Nair' }]]
      state.callerRow = { ...activeCaller, status }
      await expect(requireCaller(), status).rejects.toThrow('REDIRECT:/')
    }
    state.session = sessionFor()
    state.member = [[], []]
    state.referralPartner = [[]]
    state.prospectCaller = [[{ id: 'pcal_1', status: 'active', name: 'Priya Nair' }]]
    state.callerRow = { ...activeCaller, status: 'paused' }
    const { caller } = await requireCaller({ allowInactive: true })
    expect(caller.status).toBe('paused')
  })

  it('throws (never redirects) in action mode', async () => {
    state.session = sessionFor()
    state.member = [[], []]
    state.referralPartner = [[]]
    state.prospectCaller = [[{ id: 'pcal_1', status: 'active', name: 'Priya Nair' }]]
    state.callerRow = null
    await expect(requireCaller({ redirectOnFail: false })).rejects.toThrow(/active caller account required/i)
  })
})

describe('a caller never lands inside another persona’s shell', () => {
  it('/, the dashboard shell and every (default) page send a caller to /calls', () => {
    expect(homePathFor('caller')).toBe('/calls')
  })
})
