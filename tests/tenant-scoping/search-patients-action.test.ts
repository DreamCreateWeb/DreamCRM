/**
 * searchPatientsAction (the shared PatientCombobox's search) takes the org
 * from the SESSION — never from the caller — and rides searchPatientOptions,
 * the one tenant-scoped ILIKE (tests/tenant-scoping/patient-search-options).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ctx = { tenantType: 'clinic' as string, organizationId: 'org_session' }
const search = vi.fn(async (..._a: unknown[]) => [{ id: 'p1', name: 'Mia Hayes', hint: null }])

vi.mock('@/lib/auth/context', () => ({ requireTenant: async () => ctx }))
vi.mock('@/lib/services/patients', () => ({ searchPatientOptions: (...a: unknown[]) => search(...a) }))

import { searchPatientsAction } from '@/app/(default)/patients/search-actions'

beforeEach(() => {
  search.mockClear()
  ctx.tenantType = 'clinic'
})

describe('searchPatientsAction', () => {
  it('searches the session org with a clamped query', async () => {
    await searchPatientsAction('x'.repeat(500))
    expect(search).toHaveBeenCalledWith('org_session', 'x'.repeat(80))
  })
  it('answers nothing to a non-clinic tenant', async () => {
    ctx.tenantType = 'platform'
    expect(await searchPatientsAction('mia')).toEqual([])
    expect(search).not.toHaveBeenCalled()
  })
})
