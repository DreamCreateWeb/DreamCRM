import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ML-63 — the Resend domain service: create once, verify stamps, a failure is
 * an engine strike, the sweep walks pending rows, MX is never asked for.
 */

const h = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  sweepRows: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  strike: vi.fn(async (..._a: unknown[]) => true),
  create: vi.fn(),
  verify: vi.fn(async (..._a: unknown[]) => ({ error: null })),
  get: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      const chain: Record<string, unknown> = {}
      chain.from = () => chain
      chain.innerJoin = () => chain
      chain.where = () => {
        const p = Promise.resolve(h.sweepRows) as Promise<unknown> & { limit: () => Promise<unknown[]> }
        p.limit = async () => (h.profile ? [h.profile] : [])
        return p
      }
      return chain
    },
    update: () => ({
      set: (payload: Record<string, unknown>) => ({
        where: async () => {
          h.updates.push(payload)
          if (h.profile) {
            h.profile = {
              ...h.profile,
              id: payload.emailDomainId ?? h.profile.id,
              name: payload.emailDomainName ?? h.profile.name,
              status: payload.emailDomainStatus ?? h.profile.status,
              records: payload.emailDomainRecords ?? h.profile.records,
              verifiedAt: payload.emailDomainVerifiedAt ?? h.profile.verifiedAt,
            }
          }
        },
      }),
    }),
  },
}))
vi.mock('@/lib/services/engine-failures', () => ({ reportAutomationFailure: h.strike }))
vi.mock('@/lib/services/billing-state', () => ({ listShutDownOrgIds: vi.fn(async () => new Set<string>(['org_dead'])) }))

import {
  requestEmailDomain,
  checkEmailDomain,
  sweepPendingEmailDomains,
  normalizeRecords,
  mapResendStatus,
  __setResendDomainsClient,
} from '@/lib/services/email-domain'

const RESEND_RECORDS = [
  { record: 'SPF', name: 'send', type: 'MX', value: 'feedback-smtp.us-east-1.amazonses.com', status: 'not_started', priority: 10 },
  { record: 'SPF', name: 'send', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all', status: 'not_started' },
  { record: 'DKIM', name: 'resend._domainkey', type: 'TXT', value: 'p=MIGfMA0', status: 'not_started' },
  { record: 'Receiving', name: '@', type: 'MX', value: 'inbound-smtp.us-east-1.amazonaws.com', status: 'not_started', priority: 9 },
]

beforeEach(() => {
  h.profile = {
    websiteDomain: 'www.acmedental.com',
    customDomainStatus: { state: 'active' },
    id: null,
    name: null,
    status: null,
    records: null,
    checkedAt: null,
    verifiedAt: null,
  }
  h.sweepRows = []
  h.updates = []
  h.strike.mockClear()
  h.create.mockReset()
  h.verify.mockClear()
  h.get.mockReset()
  h.create.mockResolvedValue({ data: { id: 'dom_1', status: 'not_started', records: RESEND_RECORDS }, error: null })
  __setResendDomainsClient(() => ({ domains: { create: h.create, verify: h.verify, get: h.get, remove: vi.fn() } }))
})

describe('pure helpers', () => {
  it('maps Resend statuses; temporary_failure keeps trying', () => {
    expect(mapResendStatus('verified')).toBe('verified')
    expect(mapResendStatus('failed')).toBe('failed')
    expect(mapResendStatus('temporary_failure')).toBe('pending')
    expect(mapResendStatus('not_started')).toBe('pending')
  })
  it('never carries the receiving MX', () => {
    const rows = normalizeRecords('acmedental.com', RESEND_RECORDS)
    expect(rows.map((r) => r.purpose)).toEqual(['SPF', 'SPF', 'DKIM'])
    expect(rows.some((r) => r.value.includes('inbound-smtp'))).toBe(false)
    expect(rows[2]).toMatchObject({ host: 'resend._domainkey', name: 'resend._domainkey.acmedental.com' })
  })
})

describe('requestEmailDomain', () => {
  it('refuses until the site is live on the custom domain', async () => {
    h.profile!.customDomainStatus = { state: 'pending_dns' }
    const r = await requestEmailDomain('org1')
    expect(r.ok).toBe(false)
    expect(h.create).not.toHaveBeenCalled()
  })
  it('creates the bare domain once, stores id + records as pending', async () => {
    const r = await requestEmailDomain('org1')
    expect(h.create).toHaveBeenCalledWith({ name: 'acmedental.com' })
    expect(r.ok && r.state.status).toBe('pending')
    expect(h.updates[0]).toMatchObject({ emailDomainId: 'dom_1', emailDomainName: 'acmedental.com', emailDomainStatus: 'pending' })
    // a second click does not create a second Resend domain
    const again = await requestEmailDomain('org1')
    expect(again.ok).toBe(true)
    expect(h.create).toHaveBeenCalledTimes(1)
  })
  it('surfaces a Resend error in words, stores nothing', async () => {
    h.create.mockResolvedValue({ data: null, error: { message: 'The domain is already registered' } })
    const r = await requestEmailDomain('org1')
    expect(r).toEqual({ ok: false, error: 'The domain is already registered' })
    expect(h.updates).toHaveLength(0)
  })
})

describe('checkEmailDomain', () => {
  beforeEach(async () => {
    await requestEmailDomain('org1')
    h.updates = []
  })
  it('stays pending and lists which records are missing', async () => {
    h.get.mockResolvedValue({ data: { status: 'pending', records: RESEND_RECORDS.map((r) => ({ ...r, status: r.record === 'DKIM' ? 'verified' : 'pending' })) }, error: null })
    const r = await checkEmailDomain('org1')
    expect(h.verify).toHaveBeenCalledWith('dom_1')
    expect(r.ok && r.state.status).toBe('pending')
    expect(r.ok && r.state.records.filter((x) => x.status !== 'verified')).toHaveLength(2)
    expect(h.updates[0]).not.toHaveProperty('emailDomainVerifiedAt')
  })
  it('verified stamps verifiedAt once', async () => {
    h.get.mockResolvedValue({ data: { status: 'verified', records: RESEND_RECORDS.map((r) => ({ ...r, status: 'verified' })) }, error: null })
    const r = await checkEmailDomain('org1')
    expect(r.ok && r.state.status).toBe('verified')
    expect(h.updates[0]).toMatchObject({ emailDomainStatus: 'verified' })
    expect(h.updates[0].emailDomainVerifiedAt).toBeInstanceOf(Date)
    h.updates = []
    await checkEmailDomain('org1')
    expect(h.updates[0]).not.toHaveProperty('emailDomainVerifiedAt')
  })
  it('a Resend failure throws (the sweep turns it into a strike)', async () => {
    h.get.mockResolvedValue({ data: null, error: { message: 'rate limited' } })
    await expect(checkEmailDomain('org1')).rejects.toThrow('rate limited')
  })
})

describe('sweepPendingEmailDomains', () => {
  it('checks pending rows on live clinics, skips shut-down ones, counts verified', async () => {
    h.sweepRows = [
      { organizationId: 'org_a', checkedAt: new Date('2026-01-02') },
      { organizationId: 'org_dead', checkedAt: null },
      { organizationId: 'org_b', checkedAt: null },
    ]
    const seen: string[] = []
    const res = await sweepPendingEmailDomains({
      check: async (id) => {
        seen.push(id)
        return { ok: true, state: { domain: 'x.com', status: id === 'org_a' ? 'verified' : 'pending', records: [], checkedAt: null, verifiedAt: null } }
      },
    })
    expect(seen).toEqual(['org_b', 'org_a']) // never-checked first
    expect(res).toMatchObject({ pending: 2, checked: 2, verified: 1, errors: [] })
  })
  it('one clinic throwing is a strike under the custom_domain producer and the walk carries on', async () => {
    h.sweepRows = [
      { organizationId: 'org_a', checkedAt: null },
      { organizationId: 'org_b', checkedAt: null },
    ]
    const res = await sweepPendingEmailDomains({
      check: async (id) => {
        if (id === 'org_a') throw new Error('boom')
        return { ok: true, state: { domain: 'x.com', status: 'pending', records: [], checkedAt: null, verifiedAt: null } }
      },
    })
    expect(res.errors).toEqual(['org_a'])
    expect(res.checked).toBe(1)
    expect(h.strike).toHaveBeenCalledWith('org_a', 'custom_domain', expect.any(Date))
  })
})
