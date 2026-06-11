/**
 * Tests for the custom-domain host→slug map: the `listActiveCustomDomains`
 * service (the DB read) + the internal API route that serves it to middleware.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { rows: Array<{ slug: string | null; type: string; domain: string | null }> } = {
  rows: [],
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: async () => state.rows,
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
  it('maps each clinic domain (lowercased) to its slug', async () => {
    state.rows = [
      { slug: 'smile-bright', type: 'clinic', domain: 'WWW.SmileBright.com' },
      { slug: 'acme', type: 'clinic', domain: 'dental.acme.com' },
    ]
    const map = await listActiveCustomDomains()
    expect(map).toEqual({
      'www.smilebright.com': 'smile-bright',
      'dental.acme.com': 'acme',
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
    expect(map).toEqual({ 'good.com': 'good' })
  })

  it('returns an empty map when no clinic has a custom domain', async () => {
    state.rows = []
    expect(await listActiveCustomDomains()).toEqual({})
  })
})

describe('GET /api/internal/custom-domains', () => {
  it('returns the host→slug JSON map', async () => {
    state.rows = [{ slug: 'smile-bright', type: 'clinic', domain: 'www.smilebright.com' }]
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ 'www.smilebright.com': 'smile-bright' })
  })

  it('sets a cacheable Cache-Control header (middleware caches the fetch)', async () => {
    state.rows = []
    const res = await GET()
    expect(res.headers.get('cache-control') ?? '').toMatch(/max-age=300/)
  })
})
