import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /contact on a clinic site is a redirect to the footer's contact anchor —
 * and the TARGET must be host-aware.
 *
 * On `slug.dreamcreatestudio.com` or a clinic's custom domain the middleware
 * prefixes every path with `/site/<slug>`, so a hardcoded `/site/<slug>`
 * redirect re-entered the rewrite (`/site/<slug>/site/<slug>`) and rendered
 * "Clinic not found" — on exactly the hosts a practice's patients browse.
 * Only the path-based www host (where nobody's patients go) ever worked.
 *
 * These tests pin the redirect target for all three host shapes, mirroring
 * resolve-site-base-path.test.ts.
 */

let mockHost = ''

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (k: string) => (k === 'host' ? mockHost : null),
  })),
}))

const redirectMock = vi.fn((target: string) => {
  throw new Error(`NEXT_REDIRECT:${target}`)
})
vi.mock('next/navigation', () => ({
  redirect: (target: string) => redirectMock(target),
}))

// clinic-site.ts pulls in the db Proxy + schema at import; stub them so the
// module loads in the test environment. Only resolveSiteBasePath runs here.
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/db/schema/auth', () => ({ organization: {} }))
vi.mock('@/lib/db/schema/platform', () => ({ clinicProfile: {}, clinicLocation: {} }))

import ContactRedirect from '@/app/site/[slug]/contact/page'

async function redirectTargetFor(host: string, slug = 'acme') {
  mockHost = host
  redirectMock.mockClear()
  await expect(
    ContactRedirect({ params: Promise.resolve({ slug }) }),
  ).rejects.toThrow('NEXT_REDIRECT')
  expect(redirectMock).toHaveBeenCalledTimes(1)
  return redirectMock.mock.calls[0][0]
}

beforeEach(() => {
  mockHost = ''
})

describe('/contact redirect target', () => {
  it('path-based on www keeps the /site/<slug> prefix', async () => {
    expect(await redirectTargetFor('www.dreamcreatestudio.com')).toBe(
      '/site/acme#site-footer-contact',
    )
  })

  it('on a clinic subdomain lands on the host root, not /site/<slug>', async () => {
    expect(await redirectTargetFor('acme.dreamcreatestudio.com')).toBe(
      '/#site-footer-contact',
    )
  })

  it('on a custom domain lands on the host root, not /site/<slug>', async () => {
    expect(await redirectTargetFor('tedpinneydds.com')).toBe('/#site-footer-contact')
  })

  it('never emits a double-prefixable /site/<slug> target off the platform host', async () => {
    const target = await redirectTargetFor('smileclinic.com', 'smile-clinic')
    expect(target.startsWith('/site/')).toBe(false)
  })
})
