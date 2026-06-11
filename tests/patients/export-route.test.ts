import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Patient CSV export route — gating + headers. Owner/admin + clinic only;
 * 404 for non-clinic, 403 for non-admin staff, attachment with text/csv on OK.
 */

const ctx = {
  value: null as null | { tenantType: string; role: string; organizationId: string; organizationSlug: string },
}
vi.mock('@/lib/auth/context', () => ({
  getTenantContext: vi.fn(async () => ctx.value),
}))

const exportPatientsCsv = vi.fn(async () => 'First Name,Last Name\r\nJane,Doe\r\n')
vi.mock('@/lib/services/patient-import', () => ({
  exportPatientsCsv: (...a: unknown[]) => exportPatientsCsv(...(a as [])),
}))

import { GET } from '@/app/(default)/patients/export/route'

beforeEach(() => {
  ctx.value = null
  exportPatientsCsv.mockClear()
})

describe('GET /patients/export', () => {
  it('404s when not signed in', async () => {
    ctx.value = null
    const res = await GET()
    expect(res.status).toBe(404)
    expect(exportPatientsCsv).not.toHaveBeenCalled()
  })

  it('404s for a non-clinic tenant', async () => {
    ctx.value = { tenantType: 'platform', role: 'owner', organizationId: 'org_1', organizationSlug: 'p' }
    const res = await GET()
    expect(res.status).toBe(404)
    expect(exportPatientsCsv).not.toHaveBeenCalled()
  })

  it('403s for a clinic member who is not owner/admin', async () => {
    ctx.value = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    const res = await GET()
    expect(res.status).toBe(403)
    expect(exportPatientsCsv).not.toHaveBeenCalled()
  })

  it('returns a text/csv attachment for an owner', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', organizationId: 'org_1', organizationSlug: 'acme' }
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
    expect(res.headers.get('Content-Disposition')).toContain('acme-patients-')
    expect(await res.text()).toContain('Jane,Doe')
    expect(exportPatientsCsv).toHaveBeenCalledWith('org_1')
  })

  it('allows an admin too', async () => {
    ctx.value = { tenantType: 'clinic', role: 'admin', organizationId: 'org_2', organizationSlug: 'beta' }
    const res = await GET()
    expect(res.status).toBe(200)
  })
})
