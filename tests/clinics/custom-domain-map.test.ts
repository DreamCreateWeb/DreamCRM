/**
 * Tests for the custom-domain host→slug map: the `listActiveCustomDomains`
 * service (the DB read) + the internal API route that serves it to middleware.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: {
  rows: Array<{ slug: string | null; type: string; domain: string | null; status?: unknown }>
} = {
  rows: [],
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          // `.where(...)` is followed by `.orderBy(...)` (deterministic
          // first-write-wins routing), so it must be both awaitable and chainable.
          where: () => {
            const res: any = Promise.resolve(state.rows)
            res.orderBy = async () => state.rows
            return res
          },
        }),
      }),
    }),
  },
}))

import { listActiveCustomDomains } from '@/lib/services/clinic-site'
import { GET } from '@/app/api/internal/custom-domains/route'

beforeEach(() => {
  state.rows = []
})

describe('listActiveCustomDomains', () => {
  it('maps a www clinic domain AND its apex sibling to the slug', async () => {
    // A www/apex pair routes BOTH hosts (deriving the apex when no status stored).
    state.rows = [
      { slug: 'smile-bright', type: 'clinic', domain: 'WWW.SmileBright.com' },
      { slug: 'acme', type: 'clinic', domain: 'dental.acme.com' },
    ]
    const map = await listActiveCustomDomains()
    expect(map).toEqual({
      'www.smilebright.com': 'smile-bright',
      'smilebright.com': 'smile-bright',
      // A non-www subdomain has no implied apex — routes only itself.
      'dental.acme.com': 'acme',
    })
  })

  it('prefers the explicit servedHosts on the stored status', async () => {
    state.rows = [
      {
        slug: 'nwa',
        type: 'clinic',
        domain: 'www.nwasmiles.com',
        status: { servedHosts: ['nwasmiles.com', 'www.nwasmiles.com'] },
      },
    ]
    const map = await listActiveCustomDomains()
    expect(map).toEqual({
      'nwasmiles.com': 'nwa',
      'www.nwasmiles.com': 'nwa',
    })
  })

  it('skips non-clinic orgs and rows with no slug/domain', async () => {
    state.rows = [
      { slug: 'platform', type: 'platform', domain: 'foo.com' },
      { slug: null, type: 'clinic', domain: 'bar.com' },
      { slug: 'ok', type: 'clinic', domain: null },
      { slug: 'good', type: 'clinic', domain: 'good.com' },
    ]
    const map = await listActiveCustomDomains()
    // good.com is a bare apex → routes both good.com and www.good.com.
    expect(map).toEqual({ 'good.com': 'good', 'www.good.com': 'good' })
  })

  it('returns an empty map when no clinic has a custom domain', async () => {
    state.rows = []
    expect(await listActiveCustomDomains()).toEqual({})
  })
})

describe('GET /api/internal/custom-domains', () => {
  it('returns the host→slug JSON map (both hosts of a pair)', async () => {
    state.rows = [{ slug: 'smile-bright', type: 'clinic', domain: 'www.smilebright.com' }]
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      'www.smilebright.com': 'smile-bright',
      'smilebright.com': 'smile-bright',
    })
  })

  it('sets a cacheable Cache-Control header (middleware caches the fetch)', async () => {
    state.rows = []
    const res = await GET()
    expect(res.headers.get('cache-control') ?? '').toMatch(/max-age=300/)
  })
})
