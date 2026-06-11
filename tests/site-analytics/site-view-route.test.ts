import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/services/site-analytics', () => ({ recordSiteView: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/clinic-site', () => ({
  getClinicOrgIdBySlug: vi.fn(async (_slug: string) => 'org-from-slug'),
}))

import { POST } from '@/app/api/site-view/route'
import { recordSiteView } from '@/lib/services/site-analytics'
import { getClinicOrgIdBySlug } from '@/lib/services/clinic-site'

const recordMock = vi.mocked(recordSiteView)
const slugMock = vi.mocked(getClinicOrgIdBySlug)

function makeReq(body: unknown, ua = 'Mozilla/5.0 (Macintosh) Safari/605'): Request {
  return new Request('https://acme.dreamcreatestudio.com/api/site-view', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': ua },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  recordMock.mockClear()
  slugMock.mockClear()
  slugMock.mockResolvedValue('org-from-slug')
})

describe('POST /api/site-view', () => {
  it('records a real visit by orgId', async () => {
    const res = await POST(makeReq({ orgId: 'org1', path: '/book' }))
    expect(res.status).toBe(204)
    expect(recordMock).toHaveBeenCalledWith('org1', '/book')
  })

  it('resolves orgId from slug when orgId absent', async () => {
    await POST(makeReq({ slug: 'acme', path: '/' }))
    expect(slugMock).toHaveBeenCalledWith('acme')
    expect(recordMock).toHaveBeenCalledWith('org-from-slug', '/')
  })

  it('skips obvious bots by user-agent', async () => {
    for (const ua of [
      'Googlebot/2.1 (+http://www.google.com/bot.html)',
      'facebookexternalhit/1.1',
      'curl/8.1',
      'python-requests/2.31',
    ]) {
      const res = await POST(makeReq({ orgId: 'org1', path: '/' }, ua))
      expect(res.status).toBe(204)
    }
    expect(recordMock).not.toHaveBeenCalled()
  })

  it('skips requests with no user-agent (scripts/monitors)', async () => {
    const req = new Request('https://x/api/site-view', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId: 'org1', path: '/' }),
    })
    await POST(req)
    expect(recordMock).not.toHaveBeenCalled()
  })

  it('skips edit-mode canvases via the edit flag', async () => {
    await POST(makeReq({ orgId: 'org1', path: '/', edit: true }))
    expect(recordMock).not.toHaveBeenCalled()
  })

  it('skips edit-mode canvases via ?edit=1 in the path', async () => {
    await POST(makeReq({ orgId: 'org1', path: '/about?edit=1' }))
    expect(recordMock).not.toHaveBeenCalled()
  })

  it('no-ops (204) when neither orgId nor a resolvable slug is given', async () => {
    slugMock.mockResolvedValueOnce(null)
    const res = await POST(makeReq({ slug: 'unknown', path: '/' }))
    expect(res.status).toBe(204)
    expect(recordMock).not.toHaveBeenCalled()
  })

  it('never throws on a malformed body', async () => {
    const req = new Request('https://x/api/site-view', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0' },
      body: 'not json{',
    })
    const res = await POST(req)
    expect(res.status).toBe(204)
  })
})
