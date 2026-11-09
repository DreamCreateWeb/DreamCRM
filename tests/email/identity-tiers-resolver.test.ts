import { describe, it, expect, vi, beforeEach } from 'vitest'

/** ML-63 — the DB resolver applies the tier: Reply-To never moves. */

const state = {
  profile: {} as Record<string, unknown>,
  account: null as null | { id: string; address: string; disabled: boolean },
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () => {
            if (t === 'organization') return [{ slug: 'acme-dental', name: 'Acme Dental Org' }]
            if (t === 'clinicProfile') return [state.profile]
            if (t === 'emailAccount') return state.account ? [state.account] : []
            return []
          },
        }),
      }),
    }),
  },
  schema: { organization: 'organization', clinicProfile: 'clinicProfile', emailAccount: 'emailAccount' },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => ({})), and: vi.fn(() => ({})) }))
vi.mock('@/lib/inbound-email', () => ({
  inboundReplyAddress: (s: string) => `reply+${s}@in.dreamcreatestudio.com`,
}))

import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'

beforeEach(() => {
  state.account = null
  state.profile = {
    displayName: 'Acme Dental',
    email: 'front@acmedental.com',
    sendingAccountId: null,
    websiteDomain: 'www.acmedental.com',
    customDomainStatus: { state: 'active' },
    emailDomainName: 'acmedental.com',
    emailDomainStatus: 'verified',
  }
})

describe('getClinicSenderIdentity — Tier 3', () => {
  it('verified + live → From on their domain, Reply-To still the platform inbound', async () => {
    const s = await getClinicSenderIdentity('org1')
    expect(s.from).toBe('Acme Dental <hello@acmedental.com>')
    expect(s.replyTo).toBe('reply+acme-dental@in.dreamcreatestudio.com')
  })
  it('pending → Tier 1 platform sender', async () => {
    state.profile.emailDomainStatus = 'pending'
    const s = await getClinicSenderIdentity('org1')
    expect(s.from).toBe('Acme Dental <acme-dental@dreamcreatestudio.com>')
  })
  it('no email domain → Tier 1', async () => {
    state.profile.emailDomainName = null
    state.profile.emailDomainStatus = null
    const s = await getClinicSenderIdentity('org1')
    expect(s.from).toBe('Acme Dental <acme-dental@dreamcreatestudio.com>')
  })
  it('Gmail designated → Tier 2 wins, the platform From stays the fallback', async () => {
    state.profile.sendingAccountId = 'acct1'
    state.account = { id: 'acct1', address: 'front@acmedental.com', disabled: false }
    const s = await getClinicSenderIdentity('org1')
    expect(s.gmail?.from).toBe('Acme Dental <front@acmedental.com>')
    expect(s.from).toBe('Acme Dental <acme-dental@dreamcreatestudio.com>')
  })
})
