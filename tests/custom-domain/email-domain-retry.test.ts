import { describe, it, expect, vi, beforeEach } from 'vitest'

/** ML-63b — failed -> retried on the SAME Resend domain; removal cleans up; daily backoff. */

const h = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  sweepRows: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  strike: vi.fn(async (..._a: unknown[]) => true),
  create: vi.fn(),
  verify: vi.fn(async (..._a: unknown[]) => ({ error: null })),
  get: vi.fn(),
  remove: vi.fn(),
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
        },
      }),
    }),
  },
}))
vi.mock('@/lib/services/engine-failures', () => ({ reportAutomationFailure: h.strike }))
vi.mock('@/lib/services/billing-state', () => ({ listShutDownOrgIds: vi.fn(async () => new Set<string>()) }))

import {
  requestEmailDomain,
  removeEmailDomain,
  sweepPendingEmailDomains,
  isBackedOff,
  isDomainGone,
  normalizeRecords,
  __setResendDomainsClient,
} from '@/lib/services/email-domain'

const failedProfile = () => ({
  websiteDomain: 'www.acmedental.com',
  customDomainStatus: { state: 'active' },
  id: 'dom_1',
  name: 'acmedental.com',
  status: 'failed',
  records: [],
  checkedAt: new Date('2026-11-01'),
  verifiedAt: null,
  failedChecks: 2,
})

beforeEach(() => {
  h.profile = failedProfile()
  h.sweepRows = []
  h.updates = []
  h.strike.mockClear()
  h.create.mockReset()
  h.verify.mockClear()
  h.get.mockReset()
  h.remove.mockReset()
  h.remove.mockResolvedValue({ error: null })
  __setResendDomainsClient(() => ({ domains: { create: h.create, verify: h.verify, get: h.get, remove: h.remove } }))
})

describe('failed -> retry on the same domain', () => {
  it('verifies + gets dom_1, never creates, bumps the counter, keeps found values', async () => {
    h.get.mockResolvedValue({
      data: {
        status: 'failed',
        records: [{ record: 'DKIM', name: 'resend._domainkey', type: 'TXT', value: 'p=EXPECTED', found_value: 'p=OLD', status: 'failed' }],
      },
      error: null,
    })
    const r = await requestEmailDomain('org1')
    expect(h.verify).toHaveBeenCalledWith('dom_1')
    expect(h.create).not.toHaveBeenCalled()
    expect(r.ok && r.state.failedChecks).toBe(3)
    expect(r.ok && r.state.records[0]).toMatchObject({ value: 'p=EXPECTED', found: 'p=OLD' })
    expect(h.updates[0]).toMatchObject({ emailDomainStatus: 'failed', emailDomainFailedChecks: 3 })
  })
  it('a recovered domain resets the counter', async () => {
    h.get.mockResolvedValue({ data: { status: 'verified', records: [] }, error: null })
    const r = await requestEmailDomain('org1')
    expect(r.ok && r.state.status).toBe('verified')
    expect(h.updates[0]).toMatchObject({ emailDomainFailedChecks: 0 })
  })
  it('only when Resend says it is gone does a fresh registration happen', async () => {
    h.get.mockResolvedValue({ data: null, error: { message: 'Domain not found', statusCode: 404 } })
    h.create.mockResolvedValue({ data: { id: 'dom_2', status: 'not_started', records: [] }, error: null })
    const r = await requestEmailDomain('org1')
    expect(h.create).toHaveBeenCalledTimes(1)
    expect(h.updates[0]).toMatchObject({ emailDomainId: 'dom_2', emailDomainFailedChecks: 0 })
    expect(r.ok).toBe(true)
  })
  it('a transient Resend error does not register a duplicate', async () => {
    h.get.mockResolvedValue({ data: null, error: { message: 'rate limited', statusCode: 429 } })
    const r = await requestEmailDomain('org1')
    expect(r.ok).toBe(false)
    expect(h.create).not.toHaveBeenCalled()
  })
  it('pure helpers', () => {
    expect(isBackedOff(2)).toBe(false)
    expect(isBackedOff(3)).toBe(true)
    expect(isDomainGone({ statusCode: 404 })).toBe(true)
    expect(isDomainGone({ message: 'boom' })).toBe(false)
    expect(normalizeRecords('a.com', [{ record: 'SPF', name: 'send', type: 'TXT', value: 'v', current_value: 'w' }])[0].found).toBe('w')
  })
})

describe('removeEmailDomain', () => {
  it('deletes the Resend domain and clears every column', async () => {
    await removeEmailDomain('org1')
    expect(h.remove).toHaveBeenCalledWith('dom_1')
    expect(h.updates[0]).toEqual({
      emailDomainId: null,
      emailDomainName: null,
      emailDomainStatus: null,
      emailDomainRecords: null,
      emailDomainCheckedAt: null,
      emailDomainVerifiedAt: null,
      emailDomainFailedChecks: 0,
    })
  })
  it('fails open: a Resend error is one strike and the columns still clear', async () => {
    h.remove.mockRejectedValue(new Error('down'))
    await removeEmailDomain('org1')
    expect(h.strike).toHaveBeenCalledWith('org1', 'custom_domain', expect.any(Date))
    expect(h.updates).toHaveLength(1)
  })
  it('does nothing when there is no email domain, or the same apex is re-connected', async () => {
    h.profile = { id: null, name: null }
    await removeEmailDomain('org1')
    expect(h.updates).toHaveLength(0)
    h.profile = failedProfile()
    await removeEmailDomain('org1', { keepIfName: 'acmedental.com' })
    expect(h.remove).not.toHaveBeenCalled()
  })
})

describe('sweep backoff', () => {
  it('a domain with 3 failures is skipped inside 24h, asked after', async () => {
    const now = new Date('2026-11-10T12:00:00Z')
    h.sweepRows = [
      { organizationId: 'recent', checkedAt: new Date('2026-11-10T06:00:00Z'), failedChecks: 3 },
      { organizationId: 'old', checkedAt: new Date('2026-11-09T06:00:00Z'), failedChecks: 3 },
      { organizationId: 'young', checkedAt: new Date('2026-11-10T11:50:00Z'), failedChecks: 1 },
    ]
    const seen: string[] = []
    await sweepPendingEmailDomains({
      now,
      check: async (id) => {
        seen.push(id)
        return { ok: true, state: { domain: 'x.com', status: 'failed', records: [], checkedAt: null, verifiedAt: null } }
      },
    })
    expect(seen.sort()).toEqual(['old', 'young'])
  })
})
