/**
 * The CloudFront tenant driver (2026-07-22) — the scale path that breaks App
 * Runner's 5-custom-domains-per-service cap. Covers: the driver env switch
 * routing NEW requests to CreateDistributionTenant (routing-only DNS records,
 * zero-touch managed cert), the driver STAMP dispatching status checks +
 * removal regardless of the env, the manual degrade when the create fails,
 * and that legacy (App Runner) statuses never touch CloudFront.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

const state: {
  profile: Record<string, unknown> | null
  updates: Array<Record<string, unknown>>
} = { profile: null, updates: [] }

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => {
          const res: any = Promise.resolve([])
          res.limit = async () => (state.profile ? [state.profile] : [])
          return res
        },
      }),
    }),
    update: () => ({
      set: (payload: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push(payload)
          state.profile = { ...(state.profile ?? {}), ...payload }
          return undefined
        },
      }),
    }),
  },
}))

type AwsFn = (input: unknown) => Promise<unknown>
const cfMock = {
  createTenant: vi.fn() as ReturnType<typeof vi.fn> & AwsFn,
  getByDomain: vi.fn() as ReturnType<typeof vi.fn> & AwsFn,
  updateTenant: vi.fn() as ReturnType<typeof vi.fn> & AwsFn,
  deleteTenant: vi.fn() as ReturnType<typeof vi.fn> & AwsFn,
  verifyDns: vi.fn() as ReturnType<typeof vi.fn> & AwsFn,
  getManagedCert: vi.fn() as ReturnType<typeof vi.fn> & AwsFn,
}
const appRunner = {
  describe: vi.fn() as ReturnType<typeof vi.fn> & AwsFn,
  disassociate: vi.fn() as ReturnType<typeof vi.fn> & AwsFn,
}

vi.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: class {
    send(cmd: { __type: string; input: unknown }) {
      if (cmd.__type === 'createTenant') return cfMock.createTenant(cmd.input)
      if (cmd.__type === 'getByDomain') return cfMock.getByDomain(cmd.input)
      if (cmd.__type === 'updateTenant') return cfMock.updateTenant(cmd.input)
      if (cmd.__type === 'deleteTenant') return cfMock.deleteTenant(cmd.input)
      if (cmd.__type === 'verifyDns') return cfMock.verifyDns(cmd.input)
      if (cmd.__type === 'getManagedCert') return cfMock.getManagedCert(cmd.input)
      throw new Error('unknown command')
    }
  },
  CreateDistributionTenantCommand: class {
    __type = 'createTenant'
    constructor(public input: unknown) {}
  },
  GetDistributionTenantByDomainCommand: class {
    __type = 'getByDomain'
    constructor(public input: unknown) {}
  },
  UpdateDistributionTenantCommand: class {
    __type = 'updateTenant'
    constructor(public input: unknown) {}
  },
  DeleteDistributionTenantCommand: class {
    __type = 'deleteTenant'
    constructor(public input: unknown) {}
  },
  VerifyDnsConfigurationCommand: class {
    __type = 'verifyDns'
    constructor(public input: unknown) {}
  },
  GetManagedCertificateDetailsCommand: class {
    __type = 'getManagedCert'
    constructor(public input: unknown) {}
  },
}))

vi.mock('@aws-sdk/client-apprunner', () => ({
  AppRunnerClient: class {
    send(cmd: { __type: string; input: unknown }) {
      if (cmd.__type === 'describe') return appRunner.describe(cmd.input)
      if (cmd.__type === 'disassociate') return appRunner.disassociate(cmd.input)
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
  requestCustomDomain,
  checkCustomDomainStatus,
  removeCustomDomain,
  type CustomDomainStatus,
} from '@/lib/services/custom-domain'

const ORG = 'org_1'
const ENDPOINT = 'd33npqpgmkgof7.cloudfront.net'

beforeEach(() => {
  state.profile = { organizationId: ORG, websiteDomain: null, customDomainStatus: null }
  state.updates = []
  cfMock.createTenant.mockReset().mockResolvedValue({ DistributionTenant: { Id: 'dt_1', Status: 'InProgress' } })
  cfMock.getByDomain.mockReset()
  cfMock.updateTenant.mockReset().mockResolvedValue({ ETag: 'etag2' })
  cfMock.deleteTenant.mockReset().mockResolvedValue({})
  cfMock.verifyDns.mockReset().mockResolvedValue({ DnsConfigurationList: [] })
  cfMock.getManagedCert.mockReset().mockResolvedValue({
    ManagedCertificateDetails: { CertificateArn: 'arn:acm:cert-1', CertificateStatus: 'issued' },
  })
  appRunner.describe.mockReset()
  appRunner.disassociate.mockReset()
  process.env.CUSTOM_DOMAIN_DRIVER = 'cloudfront'
  process.env.CF_TENANT_DISTRIBUTION_ID = 'E176U1KOAVOGGO'
  process.env.CF_CONNECTION_GROUP_ID = 'cg_abc'
  process.env.CF_ROUTING_ENDPOINT = ENDPOINT
  process.env.APP_RUNNER_SERVICE_ARN = 'arn:aws:apprunner:us-east-1:1:service/dreamcrm/abc'
})

afterAll(() => {
  delete process.env.CUSTOM_DOMAIN_DRIVER
  delete process.env.CF_TENANT_DISTRIBUTION_ID
  delete process.env.CF_CONNECTION_GROUP_ID
  delete process.env.CF_ROUTING_ENDPOINT
})

describe('requestCustomDomain (driver=cloudfront)', () => {
  it('creates a distribution tenant for the apex pair with a zero-touch managed cert', async () => {
    const r = await requestCustomDomain(ORG, 'smilebright.com')
    expect(r.ok).toBe(true)
    expect(cfMock.createTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        DistributionId: 'E176U1KOAVOGGO',
        Name: 'smilebright-com',
        Domains: [{ Domain: 'smilebright.com' }, { Domain: 'www.smilebright.com' }],
        ConnectionGroupId: 'cg_abc',
        ManagedCertificateRequest: { ValidationTokenHost: 'cloudfront' },
        Enabled: true,
      }),
    )
    if (!r.ok) throw new Error('unreachable')
    // Routing records + the _cf-challenge ownership TXTs — no ACM validation
    // CNAMEs (CloudFront hosts the cert validation token itself).
    expect(r.status.driver).toBe('cloudfront')
    expect(r.status.state).toBe('pending_dns')
    const routing = r.status.dnsRecords.filter((d) => d.purpose === 'routing')
    expect(routing.map((d) => d.value)).toEqual([ENDPOINT, ENDPOINT])
    const ownership = r.status.dnsRecords.filter((d) => d.type === 'TXT')
    expect(ownership.map((d) => d.name)).toEqual([
      '_cf-challenge.smilebright.com',
      '_cf-challenge.www.smilebright.com',
    ])
    expect(ownership.every((d) => d.value === ENDPOINT)).toBe(true)
    // Persisted for the middleware host→slug map.
    expect(state.profile?.websiteDomain).toBe('www.smilebright.com')
  })

  it('degrades to the manual state (driver stamped) when the tenant create fails', async () => {
    cfMock.createTenant.mockRejectedValue(new Error('AccessDenied'))
    const r = await requestCustomDomain(ORG, 'smilebright.com')
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(r.status.error).toBe('manual')
    expect(r.status.driver).toBe('cloudfront')
  })

  it('treats an already-existing tenant as success (re-connect after a partial run)', async () => {
    cfMock.createTenant.mockRejectedValue(new Error('EntityAlreadyExists: tenant exists'))
    const r = await requestCustomDomain(ORG, 'smilebright.com')
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(r.status.error).toBeUndefined()
    expect(r.status.state).toBe('pending_dns')
  })

  it('falls to manual when the CloudFront env ids are missing', async () => {
    delete process.env.CF_TENANT_DISTRIBUTION_ID
    const r = await requestCustomDomain(ORG, 'smilebright.com')
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(r.status.error).toBe('manual')
    expect(cfMock.createTenant).not.toHaveBeenCalled()
  })
})

describe('checkCustomDomainStatus (dispatches on the STAMPED driver)', () => {
  function storedStatus(over: Partial<CustomDomainStatus> = {}): CustomDomainStatus {
    return {
      state: 'pending_dns',
      domain: 'www.smilebright.com',
      associateHost: 'smilebright.com',
      servedHosts: ['smilebright.com', 'www.smilebright.com'],
      requestedAt: new Date().toISOString(),
      dnsRecords: [],
      driver: 'cloudfront',
      ...over,
    }
  }

  it('flips to active when every served host is active on the tenant', async () => {
    state.profile = { organizationId: ORG, websiteDomain: 'www.smilebright.com', customDomainStatus: storedStatus() }
    cfMock.getByDomain.mockResolvedValue({
      DistributionTenant: {
        Id: 'dt_1',
        Domains: [
          { Domain: 'smilebright.com', Status: 'active' },
          { Domain: 'www.smilebright.com', Status: 'active' },
        ],
      },
      ETag: 'etag1',
    })
    const r = await checkCustomDomainStatus(ORG)
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(r.status.state).toBe('active')
    expect(appRunner.describe).not.toHaveBeenCalled()
    // The activation nudge fires for every served host (the API twin of the
    // console's "Submit" — without it a correctly-pointed domain can sit
    // inactive on CloudFront's slow probe cycle).
    expect(cfMock.verifyDns).toHaveBeenCalledTimes(2)
    expect(cfMock.verifyDns).toHaveBeenCalledWith(
      expect.objectContaining({ Domain: 'smilebright.com', Identifier: 'dt_1' }),
    )
    // With no Customizations on the tenant, the issued managed cert gets
    // ATTACHED — issuance alone leaves domains inactive (observed live).
    expect(cfMock.updateTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        Id: 'dt_1',
        Customizations: { Certificate: { Arn: 'arn:acm:cert-1' } },
      }),
    )
  })

  it('never re-attaches when the tenant already carries a certificate', async () => {
    state.profile = { organizationId: ORG, websiteDomain: 'www.smilebright.com', customDomainStatus: storedStatus() }
    cfMock.getByDomain.mockResolvedValue({
      DistributionTenant: {
        Id: 'dt_1',
        Customizations: { Certificate: { Arn: 'arn:acm:cert-1' } },
        Domains: [
          { Domain: 'smilebright.com', Status: 'active' },
          { Domain: 'www.smilebright.com', Status: 'active' },
        ],
      },
      ETag: 'etag1',
    })
    const r = await checkCustomDomainStatus(ORG)
    expect(r.ok).toBe(true)
    expect(cfMock.getManagedCert).not.toHaveBeenCalled()
    expect(cfMock.updateTenant).not.toHaveBeenCalled()
  })

  it('stays pending while any served host is inactive', async () => {
    state.profile = { organizationId: ORG, websiteDomain: 'www.smilebright.com', customDomainStatus: storedStatus() }
    cfMock.getByDomain.mockResolvedValue({
      DistributionTenant: {
        Id: 'dt_1',
        Domains: [
          { Domain: 'smilebright.com', Status: 'active' },
          { Domain: 'www.smilebright.com', Status: 'inactive' },
        ],
      },
      ETag: 'etag1',
    })
    const r = await checkCustomDomainStatus(ORG)
    if (!r.ok) throw new Error('unreachable')
    expect(r.status.state).toBe('pending_dns')
  })

  it('a legacy status without a driver still polls App Runner (never CloudFront)', async () => {
    state.profile = {
      organizationId: ORG,
      websiteDomain: 'www.nwasmiles.com',
      customDomainStatus: storedStatus({ domain: 'www.nwasmiles.com', associateHost: 'nwasmiles.com', driver: undefined }),
    }
    appRunner.describe.mockResolvedValue({ CustomDomains: [], DNSTarget: 'x.awsapprunner.com' })
    const r = await checkCustomDomainStatus(ORG)
    expect(r.ok).toBe(true)
    expect(appRunner.describe).toHaveBeenCalledTimes(1)
    expect(cfMock.getByDomain).not.toHaveBeenCalled()
  })
})

describe('removeCustomDomain (driver=cloudfront)', () => {
  it('disables then deletes the tenant and clears the profile', async () => {
    state.profile = {
      organizationId: ORG,
      websiteDomain: 'www.smilebright.com',
      customDomainStatus: {
        state: 'active',
        domain: 'www.smilebright.com',
        associateHost: 'smilebright.com',
        requestedAt: new Date().toISOString(),
        dnsRecords: [],
        driver: 'cloudfront',
      } satisfies CustomDomainStatus,
    }
    cfMock.getByDomain.mockResolvedValue({ DistributionTenant: { Id: 'dt_1' }, ETag: 'etag1' })
    const r = await removeCustomDomain(ORG)
    expect(r).toEqual({ ok: true })
    expect(cfMock.updateTenant).toHaveBeenCalledWith(expect.objectContaining({ Id: 'dt_1', IfMatch: 'etag1', Enabled: false }))
    expect(cfMock.deleteTenant).toHaveBeenCalledWith(expect.objectContaining({ Id: 'dt_1', IfMatch: 'etag2' }))
    expect(appRunner.disassociate).not.toHaveBeenCalled()
    expect(state.profile?.websiteDomain).toBeNull()
  })

  it('still clears the profile when the tenant is already gone', async () => {
    state.profile = {
      organizationId: ORG,
      websiteDomain: 'www.smilebright.com',
      customDomainStatus: {
        state: 'pending_dns',
        domain: 'www.smilebright.com',
        requestedAt: new Date().toISOString(),
        dnsRecords: [],
        driver: 'cloudfront',
      } satisfies CustomDomainStatus,
    }
    cfMock.getByDomain.mockRejectedValue(new Error('EntityNotFound'))
    const r = await removeCustomDomain(ORG)
    expect(r).toEqual({ ok: true })
    expect(state.profile?.websiteDomain).toBeNull()
  })
})
