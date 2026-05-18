import { describe, it, expect, vi, beforeEach } from 'vitest'

interface StubOrg { id: string; name: string; slug: string; type: 'platform' | 'clinic' }
interface StubProfile { organizationId: string; websiteDomain: string | null }
interface StubLocation { id: string; organizationId: string; isPrimary: number; createdAt: Date }

const stubs: {
  org: StubOrg | null
  profile: StubProfile | null
  locations: StubLocation[]
} = { org: null, profile: null, locations: [] }

function chain<T>(fn: () => T) {
  const obj: any = {}
  obj.from = () => obj
  obj.where = () => obj
  obj.orderBy = () => obj
  obj.limit = async () => {
    const out = fn()
    return out ? [out] : []
  }
  // For locations the call ends in .orderBy() (no .limit), which must itself be awaitable.
  // Return a thenable so `await chain` resolves to the result array.
  obj.then = (resolve: (v: unknown) => void) => resolve(fn())
  return obj
}

vi.mock('@/lib/db', async () => {
  const { organization } = await import('@/lib/db/schema/auth')
  const { clinicProfile, clinicLocation } = await import('@/lib/db/schema/platform')
  return {
    db: {
      select: (_cols?: unknown) => ({
        from: (table: unknown) => {
          if (table === organization) return chain(() => stubs.org)
          if (table === clinicProfile) return chain(() => stubs.profile)
          if (table === clinicLocation) return chain(() => stubs.locations as unknown as StubLocation)
          return chain(() => null)
        },
      }),
    },
  }
})

import { getClinicSiteBySlug, getClinicSiteByDomain } from '@/lib/services/clinic-site'

beforeEach(() => {
  stubs.org = null
  stubs.profile = null
  stubs.locations = []
})

describe('getClinicSiteBySlug', () => {
  it('returns null when org does not exist', async () => {
    const result = await getClinicSiteBySlug('missing')
    expect(result).toBeNull()
  })

  it('returns null when org type is not clinic', async () => {
    stubs.org = { id: 'org_1', name: 'Dream', slug: 'dream', type: 'platform' }
    const result = await getClinicSiteBySlug('dream')
    expect(result).toBeNull()
  })

  it('returns null when clinic has no profile yet', async () => {
    stubs.org = { id: 'org_1', name: 'Acme', slug: 'acme', type: 'clinic' }
    stubs.profile = null
    const result = await getClinicSiteBySlug('acme')
    expect(result).toBeNull()
  })

  it('returns site data with profile and locations when present', async () => {
    stubs.org = { id: 'org_1', name: 'Acme', slug: 'acme', type: 'clinic' }
    stubs.profile = { organizationId: 'org_1', websiteDomain: null }
    stubs.locations = [
      { id: 'loc_1', organizationId: 'org_1', isPrimary: 1, createdAt: new Date('2024-01-01') },
      { id: 'loc_2', organizationId: 'org_1', isPrimary: 0, createdAt: new Date('2024-02-01') },
    ]
    const result = await getClinicSiteBySlug('acme')
    expect(result).not.toBeNull()
    expect(result!.orgId).toBe('org_1')
    expect(result!.locations).toHaveLength(2)
    expect(result!.primaryLocation?.id).toBe('loc_1')
  })

  it('falls back to first location when none is marked primary', async () => {
    stubs.org = { id: 'org_1', name: 'Acme', slug: 'acme', type: 'clinic' }
    stubs.profile = { organizationId: 'org_1', websiteDomain: null }
    stubs.locations = [
      { id: 'loc_a', organizationId: 'org_1', isPrimary: 0, createdAt: new Date('2024-01-01') },
    ]
    const result = await getClinicSiteBySlug('acme')
    expect(result!.primaryLocation?.id).toBe('loc_a')
  })

  it('returns null primaryLocation when no locations exist', async () => {
    stubs.org = { id: 'org_1', name: 'Acme', slug: 'acme', type: 'clinic' }
    stubs.profile = { organizationId: 'org_1', websiteDomain: null }
    stubs.locations = []
    const result = await getClinicSiteBySlug('acme')
    expect(result!.primaryLocation).toBeNull()
  })
})

describe('getClinicSiteByDomain', () => {
  it('returns null when no profile matches the domain', async () => {
    stubs.profile = null
    const result = await getClinicSiteByDomain('custom.com')
    expect(result).toBeNull()
  })

  it('returns site data when domain match has a valid org', async () => {
    stubs.profile = { organizationId: 'org_1', websiteDomain: 'custom.com' }
    stubs.org = { id: 'org_1', name: 'Acme', slug: 'acme', type: 'clinic' }
    stubs.locations = []
    const result = await getClinicSiteByDomain('custom.com')
    expect(result).not.toBeNull()
    expect(result!.slug).toBe('acme')
  })
})
