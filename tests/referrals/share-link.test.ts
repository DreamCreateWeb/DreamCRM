import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email', () => ({ authEmailShell: vi.fn(), deliver: vi.fn() }))

const state = vi.hoisted(() => ({
  partners: [] as { id: string; status: string; shareCode: string | null }[],
  profile: { organizationId: 'o1', referralPartnerId: null as string | null, referralSource: null as string | null },
}))

// A tiny fake over drizzle's chain: enough to exercise the real service.
vi.mock('@/lib/db', async () => {
  const { referralPartner, clinicProfile } = await import('@/lib/db/schema')
  const chain = (table: unknown, kind: 'select' | 'update') => {
    let patch: Record<string, unknown> | null = null
    const q: Record<string, unknown> = {
      from: () => q,
      set: (p: Record<string, unknown>) => ((patch = p), q),
      where: () => q,
      limit: async () => (table === referralPartner ? state.partners.slice(0, 1) : []),
      returning: async () => {
        if (table === clinicProfile && patch && state.profile.referralPartnerId === null) {
          Object.assign(state.profile, patch)
          return [{ organizationId: 'o1' }]
        }
        return []
      },
      then: (res: (v: unknown) => void) => {
        if (kind === 'update' && table === referralPartner && patch) {
          for (const p of state.partners) if (!p.shareCode) Object.assign(p, patch)
        }
        res(undefined)
      },
    }
    return q
  }
  return {
    db: {
      select: () => ({ from: (t: unknown) => chain(t, 'select') }),
      update: (t: unknown) => chain(t, 'update'),
    },
    schema: { referralPartner, clinicProfile },
  }
})

import {
  getOrMintShareCode,
  resolvePartnerByShareCode,
  attributeSignupToPartner,
  parseShareCode,
  partnerShareUrl,
} from '@/lib/services/referrals'

beforeEach(() => {
  state.partners = [{ id: 'p1', status: 'active', shareCode: null }]
  state.profile = { organizationId: 'o1', referralPartnerId: null, referralSource: null }
})

describe('share code shape', () => {
  it('accepts a plain code, normalizes case, rejects junk', () => {
    expect(parseShareCode('ABCD2345')).toBe('abcd2345')
    expect(parseShareCode("x'; drop")).toBeNull()
    expect(parseShareCode('abc')).toBeNull()
    expect(parseShareCode(null)).toBeNull()
  })
  it('builds the canonical URL', () => {
    expect(partnerShareUrl('abcd2345', 'https://www.dreamcreatestudio.com/')).toBe(
      'https://www.dreamcreatestudio.com/?ref=abcd2345',
    )
  })
})

describe('mint once', () => {
  it('mints a valid code on first read and returns the same one after', async () => {
    const a = await getOrMintShareCode('p1')
    expect(parseShareCode(a)).toBe(a)
    expect(await getOrMintShareCode('p1')).toBe(a)
  })
})

describe('attribution', () => {
  it('unknown / malformed codes are ignored silently', async () => {
    state.partners = []
    expect(await resolvePartnerByShareCode('zzzzzzzz')).toBeNull()
    expect(await attributeSignupToPartner('o1', 'nonsense!!')).toBe(false)
    expect(await attributeSignupToPartner('o1', undefined)).toBe(false)
    expect(state.profile.referralPartnerId).toBeNull()
  })
  it('an archived partner is a dead link', async () => {
    state.partners = [{ id: 'p1', status: 'archived', shareCode: 'abcd2345' }]
    expect(await resolvePartnerByShareCode('abcd2345')).toBeNull()
  })
  it('credits once and never overwrites', async () => {
    state.partners = [{ id: 'p1', status: 'active', shareCode: 'abcd2345' }]
    expect(await attributeSignupToPartner('o1', 'abcd2345')).toBe(true)
    expect(state.profile).toMatchObject({ referralPartnerId: 'p1', referralSource: 'link' })
    expect(await attributeSignupToPartner('o1', 'abcd2345')).toBe(false)
  })
})
