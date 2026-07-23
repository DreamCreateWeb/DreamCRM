import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The template-preview switch route. The load-bearing assertion: the redirect
 * Location is RELATIVE. Behind App Runner the handler's req.url origin is the
 * server's internal bind (https://0.0.0.0:3000) — an absolute redirect built
 * from it stranded the Studio's preview iframe on a dead address (2026-07-23,
 * the Hometown preview bug). Relative Location resolves in the browser
 * against the real public origin on every topology.
 */

const { orgMock, canEditMock, basePathMock } = vi.hoisted(() => ({
  orgMock: vi.fn(async () => 'org_1'),
  canEditMock: vi.fn(async () => true),
  basePathMock: vi.fn(async () => '/site/acme'),
}))
vi.mock('@/lib/services/clinic-site', () => ({
  getClinicOrgIdBySlug: orgMock,
  resolveSiteBasePath: basePathMock,
}))
vi.mock('@/lib/clinic-site-edit', () => ({ canEditClinic: canEditMock }))

import { GET } from '@/app/site/[slug]/template-preview/route'

const params = { params: Promise.resolve({ slug: 'acme' }) }
const req = (qs: string) =>
  new Request(`https://0.0.0.0:3000/site/acme/template-preview?${qs}`)

beforeEach(() => {
  orgMock.mockClear().mockResolvedValue('org_1')
  canEditMock.mockClear().mockResolvedValue(true)
  basePathMock.mockClear().mockResolvedValue('/site/acme')
})

describe('GET /site/[slug]/template-preview', () => {
  it('303s to a RELATIVE Location (never the internal request origin) and sets the cookie', async () => {
    const res = await GET(req('template=hometown&return=%2F%3Fedit%3D1'), params)
    expect(res.status).toBe(303)
    const loc = res.headers.get('location')!
    expect(loc).toBe('/site/acme/?edit=1')
    expect(loc).not.toContain('0.0.0.0')
    expect(loc.startsWith('/')).toBe(true)
    expect(res.headers.get('set-cookie')).toContain('dc-template-preview=acme%3Ahometown')
  })

  it('template=off clears the preview cookie', async () => {
    const res = await GET(req('template=off&return=%2F'), params)
    expect(res.status).toBe(303)
    expect(res.headers.get('set-cookie')).toMatch(/dc-template-preview=;/)
  })

  it('rejects an absolute/protocol-relative return path (no open redirect)', async () => {
    const res = await GET(req('template=hometown&return=%2F%2Fevil.example'), params)
    expect(res.headers.get('location')).toBe('/site/acme/')
  })

  it('400s an unknown template id, 403s a non-editor', async () => {
    expect((await GET(req('template=nope'), params)).status).toBe(400)
    canEditMock.mockResolvedValue(false)
    expect((await GET(req('template=hometown'), params)).status).toBe(403)
  })
})
