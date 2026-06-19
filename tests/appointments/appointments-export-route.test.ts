/**
 * GET /appointments/export — clinic gate + filter pass-through. 404 for a
 * non-clinic tenant; on OK it parses window/attention/provider/source/q and
 * returns a text/csv attachment.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const ctx = {
  value: null as null | { tenantType: string; role: string; organizationId: string; organizationSlug: string },
}
vi.mock('@/lib/auth/context', () => ({ getTenantContext: vi.fn(async () => ctx.value) }))

const exportAppointmentsCsv = vi.fn(async (_org: string, _filters: unknown) => 'Date,Time\r\n2026-06-15,10:30 AM\r\n')
vi.mock('@/lib/services/appointments', () => ({
  exportAppointmentsCsv: (org: string, filters: unknown) => exportAppointmentsCsv(org, filters),
}))

import { GET } from '@/app/(default)/appointments/export/route'

function req(qs: string): NextRequest {
  return { nextUrl: { searchParams: new URLSearchParams(qs) } } as unknown as NextRequest
}

beforeEach(() => {
  ctx.value = null
  exportAppointmentsCsv.mockClear()
})

describe('GET /appointments/export', () => {
  it('404s for a non-clinic tenant', async () => {
    ctx.value = { tenantType: 'platform', role: 'owner', organizationId: 'org_1', organizationSlug: 'p' }
    const res = await GET(req(''))
    expect(res.status).toBe(404)
    expect(exportAppointmentsCsv).not.toHaveBeenCalled()
  })

  it('parses the window + attention list + search and returns a CSV attachment', async () => {
    ctx.value = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    const res = await GET(req('window=past_30d&attention=no_show,unconfirmed&q=mia'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    expect(res.headers.get('Content-Disposition')).toContain('acme-appointments-past_30d-')
    expect(exportAppointmentsCsv).toHaveBeenCalledWith('org_1', {
      window: 'past_30d',
      attention: ['no_show', 'unconfirmed'],
      providerId: undefined,
      source: undefined,
      search: 'mia',
    })
  })

  it('defaults an unknown window to next_14d and drops junk attention values', async () => {
    ctx.value = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    await GET(req('window=zzz&attention=bogus'))
    expect(exportAppointmentsCsv).toHaveBeenCalledWith('org_1', {
      window: 'next_14d',
      attention: [],
      providerId: undefined,
      source: undefined,
      search: undefined,
    })
  })
})
