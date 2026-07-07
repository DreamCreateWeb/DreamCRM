/**
 * Unit tests for the custom-domain service. The DB is mocked (a single
 * clinic_profile row + a captured update payload) and the App Runner SDK is
 * mocked so we never hit AWS. Covers: domain validation, the request flow
 * persisting AWS-returned records, the graceful manual fallback on AccessDenied
 * / missing env, and remove.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── DB mock ──────────────────────────────────────────────────────────────────
const state: {
  profile: Record<string, unknown> | null
  updates: Array<Record<string, unknown>>
} = { profile: null, updates: [] }

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (state.profile ? [state.profile] : []) }),
      }),
    }),
    update: () => ({
      set: (payload: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push(payload)
          // Keep the in-memory profile in sync so a follow-up read sees it.
          state.profile = { ...(state.profile ?? {}), ...payload }
          return undefined
        },
      }),
    }),
  },
}))

// ── App Runner SDK mock ──────────────────────────────────────────────────────
type AwsFn = (input: unknown) => Promise<unknown>
const aws = {
  associate: vi.fn() as ReturnType<typeof vi.fn> & AwsFn,
  describe: vi.fn() as ReturnType<typeof vi.fn> & AwsFn,
  disassociate: vi.fn() as ReturnType<typeof vi.fn> & AwsFn,
}

vi.mock('@aws-sdk/client-apprunner', () => ({
  AppRunnerClient: class {
    send(cmd: { __type: string; input: unknown }) {
      if (cmd.__type === 'associate') return aws.associate(cmd.input)
      if (cmd.__type === 'describe') return aws.describe(cmd.input)
      if (cmd.__type === 'disassociate') return aws.disassociate(cmd.input)
      throw new Error('unknown command')
    }
  },
  AssociateCustomDomainCommand: class {
    __type = 'associate'
    constructor(public input: unknown) {}
  },
  DescribeCustomDomainsCommand: class {
    __type = 'describe'
    constructor(public input: unknown) {}
  },
  DisassociateCustomDomainCommand: class {
    __type = 'disassociate'
    constructor(public input: unknown) {}
  },
}))

import {
  validateCustomDomain,
  resolveCustomDomain,
  requestCustomDomain,
  checkCustomDomainStatus,
  removeCustomDomain,
  type CustomDomainStatus,
} from '@/lib/services/custom-domain'

const ORG = 'org_1'

beforeEach(() => {
  state.profile = { organizationId: ORG, websiteDomain: null, customDomainStatus: null }
  state.updates = []
  aws.associate.mockReset()
  aws.describe.mockReset()
  aws.disassociate.mockReset()
  process.env.APP_RUNNER_SERVICE_ARN = 'arn:aws:apprunner:us-east-1:1:service/dreamcrm/abc'
})

describe('validateCustomDomain', () => {
  it('accepts a www subdomain (lowercased, URL-stripped) — canonical stays www', () => {
    expect(validateCustomDomain('https://WWW.SmileBright.com/')).toEqual({
      ok: true,
      domain: 'www.smilebright.com',
    })
  })

  it('accepts a bare apex and canonicalizes to the www host', () => {
    // Apex is now supported — we associate the apex + its www sibling as a pair,
    // so the canonical (SEO/display) host is the www variant.
    expect(validateCustomDomain('smilebright.com')).toEqual({
      ok: true,
      domain: 'www.smilebright.com',
    })
  })

  it('accepts a non-www subdomain as its own host', () => {
    expect(validateCustomDomain('book.smilebright.com')).toEqual({
      ok: true,
      domain: 'book.smilebright.com',
    })
  })

  it('rejects the platform domain + its subdomains', () => {
    expect(validateCustomDomain('dreamcreatestudio.com').ok).toBe(false)
    expect(validateCustomDomain('acme.dreamcreatestudio.com').ok).toBe(false)
  })

  it('rejects garbage / non-hostnames', () => {
    expect(validateCustomDomain('').ok).toBe(false)
    expect(validateCustomDomain('not a domain').ok).toBe(false)
    expect(validateCustomDomain('foo').ok).toBe(false)
  })

  it('strips a pasted wildcard prefix (→ apex pair)', () => {
    expect(validateCustomDomain('*.smilebright.com')).toEqual({
      ok: true,
      domain: 'www.smilebright.com',
    })
  })
})

describe('resolveCustomDomain — apex/www pairing', () => {
  it('associates the apex with EnableWWWSubdomain for a bare apex', () => {
    const r = resolveCustomDomain('smilebright.com')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.plan).toEqual({
      associateHost: 'smilebright.com',
      enableWww: true,
      canonical: 'www.smilebright.com',
      servedHosts: ['smilebright.com', 'www.smilebright.com'],
    })
  })

  it('derives the apex from a www host', () => {
    const r = resolveCustomDomain('www.smilebright.com')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.plan.associateHost).toBe('smilebright.com')
    expect(r.plan.enableWww).toBe(true)
    expect(r.plan.servedHosts).toEqual(['smilebright.com', 'www.smilebright.com'])
  })

  it('leaves a non-www subdomain standalone', () => {
    const r = resolveCustomDomain('book.smilebright.com')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.plan).toEqual({
      associateHost: 'book.smilebright.com',
      enableWww: false,
      canonical: 'book.smilebright.com',
      servedHosts: ['book.smilebright.com'],
    })
  })
})

describe('requestCustomDomain — AWS happy path', () => {
  it('calls AssociateCustomDomain + persists routing + certificate records', async () => {
    aws.associate.mockResolvedValue({
      DNSTarget: 'hq7ygyvjdp.us-east-1.awsapprunner.com',
      CustomDomain: {
        DomainName: 'www.smilebright.com',
        Status: 'PENDING_CERTIFICATE_DNS_VALIDATION',
        CertificateValidationRecords: [
          { Name: '_x1.www.smilebright.com', Type: 'CNAME', Value: '_y1.acm-validations.aws' },
          { Name: '_x2.www.smilebright.com', Type: 'CNAME', Value: '_y2.acm-validations.aws' },
        ],
      },
    })
    const res = await requestCustomDomain(ORG, 'www.smilebright.com')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(aws.associate).toHaveBeenCalledTimes(1)
    // Apex pair: we associate the APEX with EnableWWWSubdomain so App Runner
    // covers both smilebright.com and www.smilebright.com under one cert.
    expect(aws.associate.mock.calls[0][0]).toMatchObject({
      DomainName: 'smilebright.com',
      EnableWWWSubdomain: true,
    })
    expect(res.status.state).toBe('pending_dns')
    expect(res.status.error).toBeUndefined()
    // Two routing records: apex (ALIAS) + www (CNAME), both pointing at target.
    const routing = res.status.dnsRecords.filter((r) => r.purpose === 'routing')
    expect(routing).toHaveLength(2)
    expect(routing.every((r) => r.value === 'hq7ygyvjdp.us-east-1.awsapprunner.com')).toBe(true)
    const apexRec = routing.find((r) => r.name === 'smilebright.com')
    const wwwRec = routing.find((r) => r.name === 'www.smilebright.com')
    expect(apexRec?.type).toBe('ALIAS')
    // Host is registrar-relative: '@' for the apex, 'www' for the www record.
    expect(apexRec?.host).toBe('@')
    expect(wwwRec?.type).toBe('CNAME')
    expect(wwwRec?.host).toBe('www')
    const certs = res.status.dnsRecords.filter((r) => r.purpose === 'certificate')
    expect(certs).toHaveLength(2)
    expect(certs[0].value).toBe('_y1.acm-validations.aws')
    // Cert host is the token label with the domain stripped (relative to zone).
    expect(certs[0].host).toBe('_x1.www')
    expect(certs[0].name).toBe('_x1.www.smilebright.com')
    // Persisted canonical websiteDomain + both served hosts.
    expect(state.profile?.websiteDomain).toBe('www.smilebright.com')
    expect(res.status.servedHosts).toEqual(['smilebright.com', 'www.smilebright.com'])
  })
})

describe('requestCustomDomain — graceful degradation', () => {
  it('persists a manual fallback when AWS throws AccessDenied', async () => {
    aws.associate.mockRejectedValue(
      Object.assign(new Error('User is not authorized'), { name: 'AccessDeniedException' }),
    )
    const res = await requestCustomDomain(ORG, 'www.smilebright.com')
    // Never throws at the clinic — returns ok with a manual-state status.
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.status.state).toBe('pending_dns')
    expect(res.status.error).toBe('manual')
    // Still gives the routing record + a placeholder cert record.
    expect(res.status.dnsRecords.find((r) => r.purpose === 'routing')).toBeTruthy()
    expect(res.status.dnsRecords.find((r) => r.purpose === 'certificate')).toBeTruthy()
    expect(state.profile?.websiteDomain).toBe('www.smilebright.com')
  })

  it('persists a manual fallback when the service ARN env is missing', async () => {
    delete process.env.APP_RUNNER_SERVICE_ARN
    const res = await requestCustomDomain(ORG, 'www.smilebright.com')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.status.error).toBe('manual')
    // AWS never called.
    expect(aws.associate).not.toHaveBeenCalled()
  })

  it('rejects an invalid domain before any AWS call', async () => {
    const res = await requestCustomDomain(ORG, 'not a domain')
    expect(res.ok).toBe(false)
    expect(aws.associate).not.toHaveBeenCalled()
  })
})

describe('checkCustomDomainStatus', () => {
  beforeEach(() => {
    const status: CustomDomainStatus = {
      state: 'pending_dns',
      domain: 'www.smilebright.com',
      requestedAt: new Date().toISOString(),
      dnsRecords: [
        { name: 'www.smilebright.com', host: 'www', type: 'CNAME', value: 'x.awsapprunner.com', purpose: 'routing' },
      ],
    }
    state.profile = { organizationId: ORG, websiteDomain: 'www.smilebright.com', customDomainStatus: status }
  })

  it('flips state to active when App Runner reports ACTIVE', async () => {
    aws.describe.mockResolvedValue({
      DNSTarget: 'x.awsapprunner.com',
      CustomDomains: [{ DomainName: 'www.smilebright.com', Status: 'ACTIVE', CertificateValidationRecords: [] }],
    })
    const res = await checkCustomDomainStatus(ORG)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.status.state).toBe('active')
    expect(res.status.lastCheckedAt).toBeTruthy()
  })

  it('stays pending when App Runner is still validating', async () => {
    aws.describe.mockResolvedValue({
      DNSTarget: 'x.awsapprunner.com',
      CustomDomains: [
        { DomainName: 'www.smilebright.com', Status: 'PENDING_CERTIFICATE_DNS_VALIDATION', CertificateValidationRecords: [] },
      ],
    })
    const res = await checkCustomDomainStatus(ORG)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.status.state).toBe('pending_dns')
  })

  it('returns an error when nothing is configured', async () => {
    state.profile = { organizationId: ORG, websiteDomain: null, customDomainStatus: null }
    const res = await checkCustomDomainStatus(ORG)
    expect(res.ok).toBe(false)
  })
})

describe('removeCustomDomain', () => {
  it('disassociates in AWS + clears websiteDomain + status', async () => {
    const status: CustomDomainStatus = {
      state: 'active',
      domain: 'www.smilebright.com',
      requestedAt: new Date().toISOString(),
      dnsRecords: [],
    }
    state.profile = { organizationId: ORG, websiteDomain: 'www.smilebright.com', customDomainStatus: status }
    aws.disassociate.mockResolvedValue({})
    const res = await removeCustomDomain(ORG)
    expect(res.ok).toBe(true)
    expect(aws.disassociate).toHaveBeenCalledTimes(1)
    expect(state.profile?.websiteDomain).toBeNull()
    expect(state.profile?.customDomainStatus).toBeNull()
  })

  it('still clears our columns when AWS disassociate fails', async () => {
    const status: CustomDomainStatus = {
      state: 'pending_dns',
      domain: 'www.smilebright.com',
      requestedAt: new Date().toISOString(),
      dnsRecords: [],
    }
    state.profile = { organizationId: ORG, websiteDomain: 'www.smilebright.com', customDomainStatus: status }
    aws.disassociate.mockRejectedValue(new Error('not found'))
    const res = await removeCustomDomain(ORG)
    expect(res.ok).toBe(true)
    expect(state.profile?.websiteDomain).toBeNull()
  })
})
