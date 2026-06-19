/**
 * GET /leads/export — clinic-only gate + filter pass-through. 404 for a
 * non-clinic tenant; on OK it parses status + q from the query and returns a
 * text/csv attachment.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const ctx = {
  value: null as null | { tenantType: string; role: string; organizationId: string; organizationSlug: string },
}
vi.mock('@/lib/auth/context', () => ({ getTenantContext: vi.fn(async () => ctx.value) }))

const exportLeadsCsv = vi.fn(async (_org: string, _filters: unknown) => 'Name,Email\r\nMia,mia@example.com\r\n')
vi.mock('@/lib/services/leads', () => ({
  exportLeadsCsv: (org: string, filters: unknown) => exportLeadsCsv(org, filters),
}))

import { GET } from '@/app/(default)/leads/export/route'

function req(qs: string): NextRequest {
  return { nextUrl: { searchParams: new URLSearchParams(qs) } } as unknown as NextRequest
}

beforeEach(() => {
  ctx.value = null
  exportLeadsCsv.mockClear()
})

describe('GET /leads/export', () => {
  it('404s for a non-clinic tenant', async () => {
    ctx.value = { tenantType: 'platform', role: 'owner', organizationId: 'org_1', organizationSlug: 'p' }
    const res = await GET(req(''))
    expect(res.status).toBe(404)
    expect(exportLeadsCsv).not.toHaveBeenCalled()
  })

  it('passes the parsed status + search through and returns a CSV attachment', async () => {
    ctx.value = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    const res = await GET(req('status=all&q=mia'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    expect(res.headers.get('Content-Disposition')).toContain('acme-leads-all-')
    expect(exportLeadsCsv).toHaveBeenCalledWith('org_1', { status: 'all', search: 'mia' })
  })

  it('defaults an unknown status to "new"', async () => {
    ctx.value = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    await GET(req('status=bogus'))
    expect(exportLeadsCsv).toHaveBeenCalledWith('org_1', { status: 'new', search: undefined })
  })
})
