import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

// Stub getSessionCookie so we can control auth state per case.
vi.mock('better-auth/cookies', () => ({
  getSessionCookie: vi.fn(),
}))

import { getSessionCookie } from 'better-auth/cookies'
import { middleware } from '@/middleware'
import { KNOWN_API_SEGMENTS, KNOWN_TOP_LEVEL_SEGMENTS, isKnownRoute } from '@/lib/known-routes'

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

  it('does NOT rewrite a reserved subdomain (api/portal/admin) to a clinic site', async () => {
    // Reserved names share the onboarding RESERVED_SLUGS list (no clinic can
    // register them), so the subdomain rewrite must skip them — otherwise a host
    // like portal.<domain> would be shadowed as /site/portal.
    for (const sub of ['api', 'portal', 'admin', 'blog']) {
      const req = makeRequest(`https://${sub}.dreamcreatestudio.com/`, `${sub}.dreamcreatestudio.com`)
      const res = (await middleware(req)) as NextResponse
      const rewrite = res.headers.get('x-middleware-rewrite')
      expect(rewrite == null || !rewrite.includes('/site/')).toBe(true)
    }
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
    for (const path of ['/product', '/pricing', '/compare/weave', '/docs/connecting-your-pms', '/blog', '/sitemap.xml', '/robots.txt', '/opengraph-image', '/icon', '/manifest.webmanifest', '/api/blog/post_1/view']) {
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

describe('unknown routes get a real 404, not the sign-in page (DREAM-164)', () => {
  // The seven paths from the audit: six plausible, one deliberate nonsense
  // control. All seven answered 200 with byte-identical sign-in HTML.
  const AUDITED = [
    '/privacy',
    '/terms',
    '/baa',
    '/security',
    '/legal',
    '/trust',
    '/definitely-not-a-real-page-zzz9',
  ]

  it('rewrites an unknown path to the not-found page instead of redirecting to /signin', async () => {
    for (const path of AUDITED) {
      const req = makeRequest(`https://www.dreamcreatestudio.com${path}`)
      const res = (await middleware(req)) as NextResponse
      expect(res.headers.get('location'), path).toBeNull()
      expect(res.headers.get('x-middleware-rewrite'), path).toContain('/_dc-not-found')
    }
  })

  it('404s an unknown path for a SIGNED-IN visitor too — existence is not an auth question', async () => {
    vi.mocked(getSessionCookie).mockReturnValue('cookie-value' as unknown as string)
    const req = makeRequest('https://www.dreamcreatestudio.com/definitely-not-a-real-page-zzz9')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('x-middleware-rewrite')).toContain('/_dc-not-found')
  })

  it('still sends an unauthenticated visitor to /signin for routes that DO exist', async () => {
    for (const path of ['/dashboard', '/patients', '/settings/team', '/inbox', '/patient/appointments']) {
      const req = makeRequest(`https://www.dreamcreatestudio.com${path}`)
      const res = (await middleware(req)) as NextResponse
      expect(res.headers.get('x-middleware-rewrite'), path).toBeNull()
      expect(res.headers.get('location') ?? '', path).toMatch(/\/signin\?redirect=/)
    }
  })

  it('leaves every public marketing page alone', async () => {
    for (const path of ['/', '/product', '/why', '/pricing', '/compare', '/compare/weave', '/docs', '/docs/connecting-your-pms', '/blog', '/grade', '/sitemap.xml', '/robots.txt']) {
      const req = makeRequest(`https://www.dreamcreatestudio.com${path}`)
      const res = (await middleware(req)) as NextResponse
      expect(res.headers.get('location'), path).toBeNull()
      expect(res.headers.get('x-middleware-rewrite'), path).toBeNull()
    }
  })

  it('answers an unknown /api path with a JSON 404, not a rendered sign-in page', async () => {
    for (const path of ['/api', '/api/not-a-real-endpoint']) {
      const req = makeRequest(`https://www.dreamcreatestudio.com${path}`)
      const res = (await middleware(req)) as NextResponse
      expect(res.status, path).toBe(404)
      expect(res.headers.get('location'), path).toBeNull()
    }
  })

  it('leaves real API routes to the auth gate', async () => {
    const req = makeRequest('https://www.dreamcreatestudio.com/api/notifications')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('location') ?? '').toMatch(/\/signin/)
  })

  it('does not 404 a clinic public site (the /site rewrite target)', async () => {
    const req = makeRequest('https://www.dreamcreatestudio.com/site/acme/book')
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it('does not 404 an unknown path on a clinic subdomain — that is the clinic site’s own 404', async () => {
    const req = makeRequest(
      'https://acme.dreamcreatestudio.com/no-such-page',
      'acme.dreamcreatestudio.com',
    )
    const res = (await middleware(req)) as NextResponse
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/acme/no-such-page')
  })
})

describe('the route census matches the app directory', () => {
  /**
   * THE LIST CANNOT DRIFT. lib/known-routes.ts decides whether a path is a
   * real route or a 404, so a section added to app/ without an entry there
   * would 404 for signed-out visitors. This walks the app directory and
   * asserts both sets are exactly what the router serves — when it fails, the
   * diff names the segment to add.
   */
  const isRouteFile = (name: string) => /^(page|route)\.(tsx?|jsx?)$/.test(name)
  const isRouteGroup = (name: string) => name.startsWith('(') && name.endsWith(')')

  // Next's metadata-file conventions mint top-level routes of their own.
  const METADATA_ROUTES: Record<string, string> = {
    icon: 'icon',
    'apple-icon': 'apple-icon',
    'opengraph-image': 'opengraph-image',
    'twitter-image': 'twitter-image',
    robots: 'robots.txt',
    sitemap: 'sitemap.xml',
    manifest: 'manifest.webmanifest',
  }

  function census() {
    const top = new Set<string>()
    const api = new Set<string>()
    const walk = (dir: string, segments: string[]) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name.startsWith('_')) continue
          walk(join(dir, entry.name), isRouteGroup(entry.name) ? segments : [...segments, entry.name])
          continue
        }
        const base = entry.name.replace(/\.[^.]+$/, '')
        if (isRouteFile(entry.name) && segments.length > 0) {
          top.add(segments[0])
          if (segments[0] === 'api' && segments.length > 1) api.add(segments[1])
        } else if (segments.length === 0 && METADATA_ROUTES[base]) {
          top.add(METADATA_ROUTES[base])
        }
      }
    }
    walk(resolve(process.cwd(), 'app'), [])
    return { top, api }
  }

  it('KNOWN_TOP_LEVEL_SEGMENTS is exactly the app router’s top-level segments', () => {
    const { top } = census()
    expect(Array.from(KNOWN_TOP_LEVEL_SEGMENTS).sort()).toEqual(Array.from(top).sort())
  })

  it('KNOWN_API_SEGMENTS is exactly the second level under app/api', () => {
    const { api } = census()
    expect(Array.from(KNOWN_API_SEGMENTS).sort()).toEqual(Array.from(api).sort())
  })

  it('every real route the census found is treated as a known route', () => {
    const { top } = census()
    for (const segment of Array.from(top)) {
      // /api needs a real second segment; the sets are asserted above.
      if (segment === 'api') continue
      expect(isKnownRoute(`/${segment}`), segment).toBe(true)
    }
  })
})
