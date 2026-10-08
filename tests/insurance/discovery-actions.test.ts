import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The discovery actions: the same clinic gate as a check (the org from the
 * session, never the client), the SSN passed through to the service as
 * typed, and revalidation only when something was stored.
 */

const tenantCtx = {
  tenantType: 'clinic' as 'clinic' | 'patient' | 'platform',
  organizationId: 'org_1',
  userId: 'user_staff',
  role: 'member',
  platformAdmin: false,
}
vi.mock('@/lib/auth/context', () => ({ requireTenant: vi.fn(async () => tenantCtx) }))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

const runInsuranceDiscovery = vi.fn()
const resumeInsuranceDiscovery = vi.fn()
vi.mock('@/lib/services/insurance-eligibility/discovery', () => ({
  runInsuranceDiscovery: (...a: unknown[]) => runInsuranceDiscovery(...(a as [])),
  resumeInsuranceDiscovery: (...a: unknown[]) => resumeInsuranceDiscovery(...(a as [])),
}))
vi.mock('@/lib/services/insurance-eligibility', () => ({}))
vi.mock('@/lib/services/insurance-eligibility/payer-notebook', () => ({}))
vi.mock('@/lib/services/patients', () => ({}))
vi.mock('@/lib/services/insurance-ocr', () => ({}))
vi.mock('@/lib/services/patient-documents', () => ({}))

import { discoverCoverageAction, resumeDiscoveryAction } from '@/app/(default)/insurance/actions'

const VIEW = { id: 'disc_1', patientId: 'pat_1', status: 'found', candidates: [], coveragesFound: 1 }
const ASK = { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12', ssn: '123456789' }

beforeEach(() => {
  tenantCtx.tenantType = 'clinic'
  runInsuranceDiscovery.mockReset()
  resumeInsuranceDiscovery.mockReset()
  revalidatePath.mockClear()
})

describe('discoverCoverageAction', () => {
  it('runs the search for the session’s org with the staff user, and revalidates the page + record', async () => {
    runInsuranceDiscovery.mockResolvedValue({ ok: true, discovery: VIEW })
    const r = await discoverCoverageAction(ASK, 'pat_1')
    expect(r.ok).toBe(true)
    expect(runInsuranceDiscovery).toHaveBeenCalledWith('org_1', { input: ASK, patientId: 'pat_1', userId: 'user_staff' })
    expect(revalidatePath).toHaveBeenCalledWith('/insurance')
    expect(revalidatePath).toHaveBeenCalledWith('/patients/pat_1')
  })

  it('refuses outside a clinic tenant without touching the service', async () => {
    tenantCtx.tenantType = 'platform'
    const r = await discoverCoverageAction(ASK, null)
    expect(r.ok).toBe(false)
    expect(runInsuranceDiscovery).not.toHaveBeenCalled()
  })

  it('passes a refusal through unchanged and revalidates nothing', async () => {
    runInsuranceDiscovery.mockResolvedValue({ ok: false, reason: 'live_only', errors: { _form: 'no' } })
    const r = await discoverCoverageAction(ASK, 123 as unknown as string)
    expect(r).toEqual({ ok: false, reason: 'live_only', errors: { _form: 'no' } })
    expect(runInsuranceDiscovery.mock.calls[0][1]).toMatchObject({ patientId: null })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('resumeDiscoveryAction', () => {
  it('asks the service again and revalidates only once the search has settled', async () => {
    resumeInsuranceDiscovery.mockResolvedValueOnce({ ok: true, discovery: { ...VIEW, status: 'pending' } })
    await resumeDiscoveryAction('disc_1')
    expect(resumeInsuranceDiscovery).toHaveBeenCalledWith('org_1', 'disc_1')
    expect(revalidatePath).not.toHaveBeenCalled()
    resumeInsuranceDiscovery.mockResolvedValueOnce({ ok: true, discovery: VIEW })
    await resumeDiscoveryAction('disc_1')
    expect(revalidatePath).toHaveBeenCalledWith('/patients/pat_1')
  })

  it('refuses outside a clinic tenant', async () => {
    tenantCtx.tenantType = 'patient'
    const r = await resumeDiscoveryAction('disc_1')
    expect(r.ok).toBe(false)
    expect(resumeInsuranceDiscovery).not.toHaveBeenCalled()
  })
})
