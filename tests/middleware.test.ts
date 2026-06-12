import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Stub getSessionCookie so we can control auth state per case.
vi.mock('better-auth/cookies', () => ({
  getSessionCookie: vi.fn(),
}))

import { getSessionCookie } from 'better-auth/cookies'
import { middleware } from '@/middleware'

function makeRequest(url: string, host = 'www.dreamcreatestudio.com') {
  return new NextRequest(new URL(url), {
    headers: { host },
  })
}

beforeEach(() => {
  vi.mocked(getSessionCookie).mockReturnValue(undefined as unknown as string)
})

describe('middleware subdomain rewrite', () => {
  it('rewrites {slug}.dreamcreatestudio.com/ → /site/{slug}', async () => {
    const req = makeRequest('https://acme.dreamcreatestudio.com/', 'acme.dreamcreatestudio.com')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/acme')
  })

  it('rewrites nested paths preserving the path', async () => {
    const req = makeRequest(
      'https://acme.dreamcreatestudio.com/book',
      'acme.dreamcreatestudio.com',
    )
    const res = (await middleware(req)) as NextResponse
    const rewrite = res.headers.get('x-middleware-rewrite')!
    expect(rewrite).toContain('/site/acme/book')
  })

  it('does NOT rewrite www subdomain — root serves the public marketing site', async () => {
    const req = makeRequest(
      'https://www.dreamcreatestudio.com/',
      'www.dreamcreatestudio.com',
    )
    const res = (await middleware(req)) as NextResponse
    // The root is public (marketing site); the page itself routes signed-in
    // users onward. No rewrite, no auth redirect.
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.headers.get('location')).toBeNull()
  })

  it('redirects app subdomain → canonical www host (preserving path)', async () => {
    const req = makeRequest(
      'https://app.dreamcreatestudio.com/dashboard',
      'app.dreamcreatestudio.com',
    )
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('https://www.dreamcreatestudio.com/dashboard')
  })

  it('does NOT redirect the health check on the app subdomain', async () => {
    const req = makeRequest(
      'https://app.dreamcreatestudio.com/api/health',
      'app.dreamcreatestudio.com',
    )
    const res = (await middleware(req)) as NextResponse
    // /api/health is exempt so the App Runner health check always gets 200
    expect(res.headers.get('location')).toBeNull()
  })

  it('does NOT rewrite apex domain', async () => {
    const req = makeRequest('https://www.dreamcreatestudio.com/', 'dreamcreatestudio.com')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it('handles uppercase host gracefully', async () => {
    const req = makeRequest(
      'https://ACME.dreamcreatestudio.com/',
      'ACME.dreamcreatestudio.com',
    )
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/acme')
  })
})

describe('middleware auth gate', () => {
  it('redirects unauthenticated requests on app domain to /signin', async () => {
    const req = makeRequest('https://www.dreamcreatestudio.com/dashboard')
    const res = (await middleware(req)) as NextResponse
    const loc = res.headers.get('location')!
    expect(loc).toMatch(/\/signin\?redirect=%2Fdashboard$/)
  })

  it('allows the apex root without auth (marketing site)', async () => {
    const req = makeRequest('https://www.dreamcreatestudio.com/')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('location')).toBeNull()
  })

  it('allows the marketing subpages without auth', async () => {
    for (const path of ['/product', '/pricing', '/compare/weave', '/docs/connecting-open-dental', '/blog', '/sitemap.xml', '/robots.txt', '/opengraph-image', '/icon', '/manifest.webmanifest', '/api/blog/post_1/view']) {
      const req = makeRequest(`https://www.dreamcreatestudio.com${path}`)
      const res = (await middleware(req)) as NextResponse
      expect(res.headers.get('location'), path).toBeNull()
    }
  })

  it('the public root is exact — sibling paths stay auth-gated', async () => {
    const req = makeRequest('https://www.dreamcreatestudio.com/patients')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('location') ?? '').toMatch(/\/signin/)
  })

  it('the dashboard posts manager (moved off /blog) stays auth-gated', async () => {
    const req = makeRequest('https://www.dreamcreatestudio.com/posts')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('location') ?? '').toMatch(/\/signin/)
  })

  it('allows /signin without auth', async () => {
    const req = makeRequest('https://www.dreamcreatestudio.com/signin')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('location')).toBeNull()
  })

  it('allows /accept-invite without auth', async () => {
    const req = makeRequest('https://www.dreamcreatestudio.com/accept-invite?token=abc')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('location')).toBeNull()
  })

  it('allows /api/webhooks/stripe without auth', async () => {
    const req = makeRequest('https://www.dreamcreatestudio.com/api/webhooks/stripe')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('location')).toBeNull()
  })

  it('allows /site/* (internal rewrite target) without auth', async () => {
    const req = makeRequest('https://www.dreamcreatestudio.com/site/acme')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('location')).toBeNull()
  })

  it('lets authenticated users through', async () => {
    vi.mocked(getSessionCookie).mockReturnValue('cookie-value' as unknown as string)
    const req = makeRequest('https://www.dreamcreatestudio.com/dashboard')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('location')).toBeNull()
  })
})

describe('middleware custom-domain routing', () => {
  // The middleware fetches its host→slug map from the internal route. Stub
  // global fetch so we control the map per case without a real network call.
  function mockMap(map: Record<string, string>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(map), { status: 200 })),
    )
  }

  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('rewrites a known custom domain → /site/{slug}', async () => {
    mockMap({ 'www.smilebright.com': 'smile-bright' })
    const req = makeRequest('https://www.smilebright.com/', 'www.smilebright.com')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/smile-bright')
  })

  it('preserves the path on a custom-domain rewrite', async () => {
    mockMap({ 'www.smilebright.com': 'smile-bright' })
    const req = makeRequest('https://www.smilebright.com/book', 'www.smilebright.com')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/smile-bright/book')
  })

  it('falls through (auth gate) on an UNKNOWN custom domain', async () => {
    mockMap({ 'www.smilebright.com': 'smile-bright' })
    // A different host that isn't in the map + an auth-gated path → /signin.
    const req = makeRequest('https://www.someoneelse.com/dashboard', 'www.someoneelse.com')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.headers.get('location') ?? '').toMatch(/\/signin/)
  })

  it('fails open when the map fetch errors (does not throw / 500)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const req = makeRequest('https://www.smilebright.com/', 'www.smilebright.com')
    // Public root path → no rewrite, no crash; just falls through.
    const res = (await middleware(req)) as NextResponse
    expect(res).toBeInstanceOf(NextResponse)
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it('does NOT call the map fetch for platform hosts (subdomain branch wins)', async () => {
    const spy = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', spy)
    const req = makeRequest('https://acme.dreamcreatestudio.com/', 'acme.dreamcreatestudio.com')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/acme')
    expect(spy).not.toHaveBeenCalled()
  })

  it('does NOT call the map fetch for the apex (platform host)', async () => {
    const spy = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', spy)
    const req = makeRequest('https://www.dreamcreatestudio.com/', 'dreamcreatestudio.com')
    await middleware(req)
    expect(spy).not.toHaveBeenCalled()
  })

  it('does NOT recurse — the internal map route itself is served, not rewritten', async () => {
    mockMap({ 'www.smilebright.com': 'smile-bright' })
    const req = makeRequest(
      'https://www.smilebright.com/api/internal/custom-domains',
      'www.smilebright.com',
    )
    const res = (await middleware(req)) as NextResponse
    // The internal route is on the public allowlist + skipped from the lookup,
    // so it's served, not rewritten under /site.
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.headers.get('location')).toBeNull()
  })
})

describe('apex + webhook host handling (Vercel redirector retired)', () => {
  it('308s the bare apex to www preserving path + query', async () => {
    const req = makeRequest('https://dreamcreatestudio.com/pricing?a=1', 'dreamcreatestudio.com')
    const res = (await middleware(req)) as NextResponse
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('https://www.dreamcreatestudio.com/pricing?a=1')
  })

  it('308s app.<domain> to www (legacy alias)', async () => {
    const req = makeRequest('https://app.dreamcreatestudio.com/', 'app.dreamcreatestudio.com')
    const res = (await middleware(req)) as NextResponse
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('https://www.dreamcreatestudio.com/')
  })

  it('NEVER redirects vendor webhooks — served on whatever host they arrive at', async () => {
    for (const host of ['app.dreamcreatestudio.com', 'dreamcreatestudio.com', 'www.dreamcreatestudio.com']) {
      const req = makeRequest(`https://${host}/api/webhooks/stripe`, host)
      const res = (await middleware(req)) as NextResponse
      expect(res.status, host).not.toBe(308)
      expect(res.headers.get('location'), host).toBeNull()
    }
  })

  it('keeps serving /api/health on the apex (App Runner health check)', async () => {
    const req = makeRequest('https://dreamcreatestudio.com/api/health', 'dreamcreatestudio.com')
    const res = (await middleware(req)) as NextResponse
    expect(res.status).not.toBe(308)
  })
})
