import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE CALLER PERSONA MATRIX (P-02).
 *
 *   - getTenantContext derives 'caller' ONLY when the user has no org
 *     membership and holds a prospect_caller row — of ANY status, with
 *     `callerStatus` on the context (a paused caller is not a stranger: a
 *     null here used to send them to /signin and then clinic onboarding);
 *     a platform admin is never a caller; a partner row wins over a caller row.
 *   - requireCaller authorizes by a DIRECT prospect_caller.user_id lookup:
 *     a clinic member, a partner, a patient and a non-caller are refused
 *     (redirected home, or thrown in action mode); a paused / archived
 *     caller is sent to /calls (the calm screen) unless the surface asks
 *     allowInactive — and /calls renders that screen for them.
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
  getCallerToday: vi.fn(async () => ({ queue: 0, holding: 0, later: 0, target: 40, dials: 0, reached: 0, callbacksDue: 0, meetings: 0 })),
  getCallerQueue: vi.fn(async () => []),
  getCallerLater: vi.fn(async () => []),
  getCallerBooked: vi.fn(async () => []),
}))
vi.mock('@/lib/services/prospecting', () => ({
  getProspectingConfig: vi.fn(async () => ({ booking: { hostTimeZone: 'America/New_York' } })),
}))
// The page's client islands — the server render under test is the chrome
// around them (the paused banner, the closed screen, the sign-out door).
vi.mock('@/app/(caller)/calls/caller-session', () => ({ default: () => null }))
vi.mock('@/app/(caller)/calls/fill-queue-button', () => ({ default: () => null }))
vi.mock('@/app/(caller)/calls/sign-out', async () => {
  const React = await import('react')
  return { default: () => React.createElement('button', { type: 'button' }, 'Sign out') }
})
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

import { renderToStaticMarkup } from 'react-dom/server'
import { getTenantContext, requireCaller, requirePartner } from '@/lib/auth/context'
import { homePathFor } from '@/lib/tenant-chrome'
import CallsPage from '@/app/(caller)/calls/page'

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

  it('derives a caller context for a paused / archived row too — callerStatus says which (never null, never onboarding)', async () => {
    for (const status of ['active', 'paused', 'archived'] as const) {
      state.session = sessionFor()
      state.member = [[], []]
      state.referralPartner = [[]]
      state.prospectCaller = [[{ id: 'pcal_1', status, name: 'Priya Nair' }]]
      const ctx = await getTenantContext()
      expect(ctx?.tenantType, status).toBe('caller')
      expect(ctx?.callerStatus, status).toBe(status)
      // The root sends every caller to /calls — a paused one included.
      expect(homePathFor(ctx!.tenantType)).toBe('/calls')
    }
  })

  it('no caller row at all → null (a stranger, not a caller)', async () => {
    state.session = sessionFor()
    state.member = [[], []]
    state.referralPartner = [[]]
    state.prospectCaller = [[]]
    expect(await getTenantContext()).toBeNull()
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

  /** ONE row, read twice (the context's select and requireCaller's lookup)
   *  — the same status both times. Two reads of one row with different
   *  statuses once masked the bounce this test now holds. */
  function asInactiveCaller(status: 'paused' | 'archived') {
    state.session = sessionFor()
    state.member = [[], []]
    state.referralPartner = [[]]
    state.prospectCaller = [[{ id: 'pcal_1', status, name: 'Priya Nair' }]]
    state.callerRow = { ...activeCaller, status }
  }

  it('a paused / archived caller is sent to /calls by default (never /signin), resolved with allowInactive, thrown in action mode', async () => {
    for (const status of ['paused', 'archived'] as const) {
      asInactiveCaller(status)
      await expect(requireCaller(), status).rejects.toThrow('REDIRECT:/calls')

      asInactiveCaller(status)
      const { caller, ctx } = await requireCaller({ allowInactive: true })
      expect(caller.status).toBe(status)
      expect(ctx.tenantType).toBe('caller')
      expect(ctx.callerStatus).toBe(status)

      asInactiveCaller(status)
      await expect(requireCaller({ redirectOnFail: false }), status).rejects.toThrow(/active caller account required/i)
    }
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

describe('the /calls page for an inactive caller with NO membership (the designed persona)', () => {
  const activeCaller = { id: 'pcal_1', status: 'active', name: 'Priya Nair', userId: 'u1' }
  function asInactiveCaller(status: 'paused' | 'archived') {
    state.session = sessionFor()
    state.member = [[], []]
    state.referralPartner = [[]]
    state.prospectCaller = [[{ id: 'pcal_1', status, name: 'Priya Nair' }]]
    state.callerRow = { ...activeCaller, status }
  }

  it('a paused caller sees the paused screen — not /signin, not onboarding', async () => {
    asInactiveCaller('paused')
    const html = renderToStaticMarkup(await CallsPage())
    expect(html).toContain('Your calling is paused right now')
    expect(html).toContain('went back to the pool')
    expect(html).not.toContain('Nothing to dial')
    expect(html).not.toContain('Fill my queue')
  })

  it('an archived caller sees the closed screen, with a way to sign out', async () => {
    asInactiveCaller('archived')
    const html = renderToStaticMarkup(await CallsPage())
    expect(html).toContain('This calling account has been closed')
    expect(html).toContain('Sign out')
    expect(html).not.toContain('Your calling is paused')
  })
})
