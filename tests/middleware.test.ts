import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Stub getSessionCookie so we can control auth state per case.
vi.mock('better-auth/cookies', () => ({
  getSessionCookie: vi.fn(),
}))

import { getSessionCookie } from 'better-auth/cookies'
import { middleware } from '@/middleware'

function makeRequest(url: string, host = 'dreamcreatestudio.com') {
  return new NextRequest(new URL(url), {
    headers: { host },
  })
}

beforeEach(() => {
  vi.mocked(getSessionCookie).mockReturnValue(undefined as unknown as string)
})

describe('middleware subdomain rewrite', () => {
  it('rewrites {slug}.dreamcreatestudio.com/ → /site/{slug}', () => {
    const req = makeRequest('https://acme.dreamcreatestudio.com/', 'acme.dreamcreatestudio.com')
    const res = middleware(req) as NextResponse
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/acme')
  })

  it('rewrites nested paths preserving the path', () => {
    const req = makeRequest(
      'https://acme.dreamcreatestudio.com/book',
      'acme.dreamcreatestudio.com',
    )
    const res = middleware(req) as NextResponse
    const rewrite = res.headers.get('x-middleware-rewrite')!
    expect(rewrite).toContain('/site/acme/book')
  })

  it('does NOT rewrite www subdomain — root serves the public marketing site', () => {
    const req = makeRequest(
      'https://www.dreamcreatestudio.com/',
      'www.dreamcreatestudio.com',
    )
    const res = middleware(req) as NextResponse
    // The root is public (marketing site); the page itself routes signed-in
    // users onward. No rewrite, no auth redirect.
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.headers.get('location')).toBeNull()
  })

  it('redirects app subdomain → canonical www host (preserving path)', () => {
    const req = makeRequest(
      'https://app.dreamcreatestudio.com/dashboard',
      'app.dreamcreatestudio.com',
    )
    const res = middleware(req) as NextResponse
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('https://www.dreamcreatestudio.com/dashboard')
  })

  it('does NOT redirect the health check on the app subdomain', () => {
    const req = makeRequest(
      'https://app.dreamcreatestudio.com/api/health',
      'app.dreamcreatestudio.com',
    )
    const res = middleware(req) as NextResponse
    // /api/health is exempt so the App Runner health check always gets 200
    expect(res.headers.get('location')).toBeNull()
  })

  it('does NOT rewrite apex domain', () => {
    const req = makeRequest('https://dreamcreatestudio.com/', 'dreamcreatestudio.com')
    const res = middleware(req) as NextResponse
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it('handles uppercase host gracefully', () => {
    const req = makeRequest(
      'https://ACME.dreamcreatestudio.com/',
      'ACME.dreamcreatestudio.com',
    )
    const res = middleware(req) as NextResponse
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/acme')
  })
})

describe('middleware auth gate', () => {
  it('redirects unauthenticated requests on app domain to /signin', () => {
    const req = makeRequest('https://dreamcreatestudio.com/dashboard')
    const res = middleware(req) as NextResponse
    const loc = res.headers.get('location')!
    expect(loc).toMatch(/\/signin\?redirect=%2Fdashboard$/)
  })

  it('allows the apex root without auth (marketing site)', () => {
    const req = makeRequest('https://dreamcreatestudio.com/')
    const res = middleware(req) as NextResponse
    expect(res.headers.get('location')).toBeNull()
  })

  it('allows the marketing subpages without auth', () => {
    for (const path of ['/product', '/pricing', '/compare/weave', '/docs/connecting-open-dental', '/blog', '/sitemap.xml', '/robots.txt', '/opengraph-image', '/icon', '/manifest.webmanifest', '/api/blog/post_1/view']) {
      const req = makeRequest(`https://dreamcreatestudio.com${path}`)
      const res = middleware(req) as NextResponse
      expect(res.headers.get('location'), path).toBeNull()
    }
  })

  it('the public root is exact — sibling paths stay auth-gated', () => {
    const req = makeRequest('https://dreamcreatestudio.com/patients')
    const res = middleware(req) as NextResponse
    expect(res.headers.get('location') ?? '').toMatch(/\/signin/)
  })

  it('the dashboard posts manager (moved off /blog) stays auth-gated', () => {
    const req = makeRequest('https://dreamcreatestudio.com/posts')
    const res = middleware(req) as NextResponse
    expect(res.headers.get('location') ?? '').toMatch(/\/signin/)
  })

  it('allows /signin without auth', () => {
    const req = makeRequest('https://dreamcreatestudio.com/signin')
    const res = middleware(req) as NextResponse
    expect(res.headers.get('location')).toBeNull()
  })

  it('allows /accept-invite without auth', () => {
    const req = makeRequest('https://dreamcreatestudio.com/accept-invite?token=abc')
    const res = middleware(req) as NextResponse
    expect(res.headers.get('location')).toBeNull()
  })

  it('allows /api/webhooks/stripe without auth', () => {
    const req = makeRequest('https://dreamcreatestudio.com/api/webhooks/stripe')
    const res = middleware(req) as NextResponse
    expect(res.headers.get('location')).toBeNull()
  })

  it('allows /site/* (internal rewrite target) without auth', () => {
    const req = makeRequest('https://dreamcreatestudio.com/site/acme')
    const res = middleware(req) as NextResponse
    expect(res.headers.get('location')).toBeNull()
  })

  it('lets authenticated users through', () => {
    vi.mocked(getSessionCookie).mockReturnValue('cookie-value' as unknown as string)
    const req = makeRequest('https://dreamcreatestudio.com/dashboard')
    const res = middleware(req) as NextResponse
    expect(res.headers.get('location')).toBeNull()
  })
})
