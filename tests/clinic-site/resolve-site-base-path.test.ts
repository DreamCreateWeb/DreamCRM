import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Host-aware base-path resolution for clinic public sites.
 *
 * The same /site/[slug] route is served two ways and the in-page link
 * prefix differs:
 *   • path-based (apex/www/local dev) → links need the /site/<slug> prefix
 *   • subdomain or custom domain       → site is at the host root, prefix ''
 *
 * Getting this wrong double-prefixed every link on the subdomain
 * (/site/<slug>/site/<slug>/… → 404), which is exactly the bug this
 * helper fixes. These tests pin the host → prefix mapping.
 */

let mockHost = ''
let mockForwardedHost: string | null = null

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (k: string) => {
      if (k === 'x-forwarded-host') return mockForwardedHost
      if (k === 'host') return mockHost
      return null
    },
  })),
}))

// clinic-site.ts pulls in the db Proxy + schema at import; stub them so the
// module loads in the test environment. We only exercise the pure helpers.
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/db/schema/auth', () => ({ organization: {} }))
vi.mock('@/lib/db/schema/platform', () => ({ clinicProfile: {}, clinicLocation: {} }))

async function resolve(slug: string) {
  const { resolveSiteBasePath } = await import('@/lib/services/clinic-site')
  return resolveSiteBasePath(slug)
}

beforeEach(() => {
  mockHost = ''
  mockForwardedHost = null
})

describe('resolveSiteBasePath', () => {
  it('path-based on the bare apex', async () => {
    mockHost = 'dreamcreatestudio.com'
    expect(await resolve('acme')).toBe('/site/acme')
  })

  it('path-based on www', async () => {
    mockHost = 'www.dreamcreatestudio.com'
    expect(await resolve('acme')).toBe('/site/acme')
  })

  it('path-based on the app host', async () => {
    mockHost = 'app.dreamcreatestudio.com'
    expect(await resolve('acme')).toBe('/site/acme')
  })

  it('path-based on localhost (dev)', async () => {
    mockHost = 'localhost:3000'
    expect(await resolve('acme')).toBe('/site/acme')
  })

  it('path-based when host header is missing', async () => {
    mockHost = ''
    expect(await resolve('acme')).toBe('/site/acme')
  })

  it('root-relative on a clinic subdomain', async () => {
    mockHost = 'acme.dreamcreatestudio.com'
    expect(await resolve('acme')).toBe('')
  })

  it('root-relative on a multi-word slug subdomain', async () => {
    mockHost = 'acme-dental-demo.dreamcreatestudio.com'
    expect(await resolve('acme-dental-demo')).toBe('')
  })

  it('root-relative on a custom domain', async () => {
    mockHost = 'smileclinic.com'
    expect(await resolve('acme')).toBe('')
  })

  it('honors x-forwarded-host over host (App Runner proxy)', async () => {
    mockForwardedHost = 'acme.dreamcreatestudio.com'
    mockHost = 'internal-alb-host'
    expect(await resolve('acme')).toBe('')
  })

  it('handles a port + comma-list in the host header', async () => {
    mockForwardedHost = 'www.dreamcreatestudio.com:443, internal'
    expect(await resolve('acme')).toBe('/site/acme')
  })

  it('is case-insensitive on the host', async () => {
    mockHost = 'WWW.DreamCreateStudio.com'
    expect(await resolve('acme')).toBe('/site/acme')
  })
})

describe('appBaseUrl', () => {
  const original = process.env.NEXT_PUBLIC_APP_URL
  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = original
  })

  it('uses NEXT_PUBLIC_APP_URL when set (trailing slash trimmed)', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.dreamcreatestudio.com/'
    vi.resetModules()
    const { appBaseUrl } = await import('@/lib/services/clinic-site')
    expect(appBaseUrl()).toBe('https://www.dreamcreatestudio.com')
  })

  it('falls back to www.<site domain> when unset', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    vi.resetModules()
    const { appBaseUrl } = await import('@/lib/services/clinic-site')
    expect(appBaseUrl()).toBe('https://www.dreamcreatestudio.com')
  })
})
