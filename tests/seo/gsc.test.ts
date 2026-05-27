import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { selectQueue: unknown[][] } = { selectQueue: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return { db: { select: () => chain(), update: () => ({ set: () => ({ where: async () => {} }) }) } }
})

vi.mock('@/lib/crypto', () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  decryptSecret: (s: string) => s.replace(/^enc:/, ''),
}))

import { getGscAuthUrl, getGscPerformance, gscOAuthConfigured } from '@/lib/services/gsc'

beforeEach(() => {
  state.selectQueue.length = 0
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'client123'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret123'
})

describe('getGscAuthUrl', () => {
  it('requests the read-only webmasters scope, offline access, and carries state + redirect', () => {
    const url = getGscAuthUrl('mystate', 'https://app.example.com/api/oauth/gsc/callback')
    expect(url).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fwebmasters.readonly')
    expect(url).toContain('access_type=offline')
    expect(url).toContain('state=mystate')
    expect(url).toContain('redirect_uri=https%3A%2F%2Fapp.example.com%2Fapi%2Foauth%2Fgsc%2Fcallback')
    expect(url).toContain('client_id=client123')
  })
})

describe('gscOAuthConfigured', () => {
  it('reflects the presence of the Google OAuth env vars', () => {
    expect(gscOAuthConfigured()).toBe(true)
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    expect(gscOAuthConfigured()).toBe(false)
  })
})

describe('getGscPerformance', () => {
  function jsonResponse(obj: unknown) {
    return { ok: true, json: async () => obj, text: async () => JSON.stringify(obj) } as Response
  }

  it('returns null when no property is selected', async () => {
    state.selectQueue.push([{ status: 'needs_site', siteUrl: null }]) // getGscConnectionView
    const out = await getGscPerformance('org_1', 28)
    expect(out).toBeNull()
  })

  it('parses totals + top queries from the search-analytics API', async () => {
    state.selectQueue.push([{ status: 'connected', siteUrl: 'sc-domain:example.com' }]) // connection view
    state.selectQueue.push([
      { accessToken: 'tok', accessExpiresAt: new Date(Date.now() + 3_600_000), refreshTokenEncrypted: 'enc:r' },
    ]) // getGscAccessToken (valid token, no refresh)

    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { dimensions?: string[] }
      if (body.dimensions?.includes('query')) {
        return jsonResponse({ rows: [{ keys: ['dentist near me'], clicks: 5, impressions: 50, position: 3.1 }] })
      }
      return jsonResponse({ rows: [{ clicks: 10, impressions: 100, ctr: 0.1, position: 5.2 }] })
    })

    const out = await getGscPerformance('org_1', 28)
    expect(out?.clicks).toBe(10)
    expect(out?.impressions).toBe(100)
    expect(out?.topQueries).toHaveLength(1)
    expect(out?.topQueries[0].query).toBe('dentist near me')
    vi.unstubAllGlobals()
  })
})
