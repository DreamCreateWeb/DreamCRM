import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The Insurance tool's server actions: clinic-only, org from the session,
 * and the "Add as new patient" path rides createPatient's dedupe + attaches
 * the check to the new record.
 */

const tenantCtx = {
  tenantType: 'clinic' as 'clinic' | 'patient' | 'platform',
  organizationId: 'org_1',
  userId: 'user_staff',
  role: 'member',
  // PREVIEW: the tool is platform-admin only until released.
  platformAdmin: true,
}
vi.mock('@/lib/auth/context', () => ({ requireTenant: vi.fn(async () => tenantCtx) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const runEligibilityCheck = vi.fn()
const attachInsuranceCheckToPatient = vi.fn(async () => true)
const searchPayers = vi.fn(async () => [{ primaryPayerId: '77777', displayName: 'Delta Dental of California' }])
vi.mock('@/lib/services/insurance-eligibility', () => ({
  runEligibilityCheck: (...a: unknown[]) => runEligibilityCheck(...(a as [])),
  attachInsuranceCheckToPatient: (...a: unknown[]) => attachInsuranceCheckToPatient(...(a as [])),
  searchPayers: (...a: unknown[]) => searchPayers(...(a as [])),
}))

const createPatient = vi.fn()
const updatePatient = vi.fn(async () => undefined)
vi.mock('@/lib/services/patients', () => ({
  createPatient: (...a: unknown[]) => createPatient(...(a as [])),
  updatePatient: (...a: unknown[]) => updatePatient(...(a as [])),
}))

import {
  checkInsuranceAction,
  createPatientFromCheckAction,
  saveInsuranceToPatientAction,
  searchPayersAction,
} from '@/app/(default)/insurance/actions'

const request = {
  patient: { firstName: 'Mia', lastName: 'Hayes', dateOfBirth: '1988-03-12' },
  carrierName: 'Delta Dental',
  memberId: 'DD-100-2231',
  groupNumber: 'G1',
  relationship: 'self' as const,
  subscriber: null,
}

beforeEach(() => {
  tenantCtx.tenantType = 'clinic'
  tenantCtx.platformAdmin = true
  runEligibilityCheck.mockReset()
  createPatient.mockReset()
  updatePatient.mockClear()
  attachInsuranceCheckToPatient.mockClear()
})

describe('checkInsuranceAction', () => {
  it('passes the org + user from the session, never from the client', async () => {
    runEligibilityCheck.mockResolvedValue({ ok: true, check: { id: 'ins_1', patientId: 'pat_1' } })
    const r = await checkInsuranceAction(request, 'pat_1')
    expect(r.ok).toBe(true)
    expect(runEligibilityCheck).toHaveBeenCalledWith('org_1', expect.objectContaining({ input: request, patientId: 'pat_1', userId: 'user_staff' }))
  })

  it('refuses non-clinic tenants with a typed error', async () => {
    tenantCtx.tenantType = 'patient'
    const r = await checkInsuranceAction(request, null)
    expect(r.ok).toBe(false)
    expect(runEligibilityCheck).not.toHaveBeenCalled()
  })

  it('searchPayersAction passes the query through, capped, and is gated like the rest', async () => {
    const r = await searchPayersAction('Delta Dental')
    expect(r.ok && r.payers[0].primaryPayerId).toBe('77777')
    expect(searchPayers).toHaveBeenCalledWith('Delta Dental')
    tenantCtx.platformAdmin = false
    expect((await searchPayersAction('Delta')).ok).toBe(false)
  })

  it('PREVIEW: refuses clinic staff who are not platform admins — every action', async () => {
    tenantCtx.platformAdmin = false
    expect((await checkInsuranceAction(request, null)).ok).toBe(false)
    expect((await saveInsuranceToPatientAction('pat_1', { carrierName: 'X', memberId: 'Y', groupNumber: null })).ok).toBe(false)
    expect((await createPatientFromCheckAction({ checkId: 'ins_1', request })).ok).toBe(false)
    expect(runEligibilityCheck).not.toHaveBeenCalled()
    expect(updatePatient).not.toHaveBeenCalled()
    expect(createPatient).not.toHaveBeenCalled()
  })
})

describe('saveInsuranceToPatientAction', () => {
  it('patches the three on-file columns AND the remembered card (source staff) — nothing else', async () => {
    const r = await saveInsuranceToPatientAction('pat_1', {
      carrierName: ' Delta Dental ',
      memberId: 'DD-1',
      groupNumber: '',
      payerId: '77777',
      payerName: 'Delta Dental of California',
      planName: 'Delta Dental PPO',
      relationship: 'child',
      subscriber: { firstName: 'Ana', lastName: 'Hayes', dateOfBirth: '1960-01-02' },
    })
    expect(r.ok).toBe(true)
    const call = (updatePatient.mock.calls[0] as unknown[])[0] as { organizationId: string; patientId: string; patch: Record<string, unknown> }
    expect(call.organizationId).toBe('org_1')
    expect(call.patientId).toBe('pat_1')
    expect(Object.keys(call.patch).sort()).toEqual(['insuranceDetail', 'insuranceGroupNumber', 'insurancePolicyNumber', 'insuranceProvider'])
    expect(call.patch).toMatchObject({ insuranceProvider: 'Delta Dental', insurancePolicyNumber: 'DD-1', insuranceGroupNumber: null })
    expect(call.patch.insuranceDetail).toMatchObject({
      memberId: 'DD-1',
      payerId: '77777',
      payerName: 'Delta Dental of California',
      planName: 'Delta Dental PPO',
      relationship: 'child',
      subscriber: { firstName: 'Ana', lastName: 'Hayes', dateOfBirth: '1960-01-02' },
      source: 'staff',
    })
  })

  it('a bad relationship from the wire floors at self and drops the policyholder', async () => {
    await saveInsuranceToPatientAction('pat_1', { carrierName: 'Cigna', memberId: 'C-1', groupNumber: null, relationship: 'dog' as never, subscriber: { firstName: 'X', lastName: 'Y', dateOfBirth: '1990-01-01' } })
    const call = (updatePatient.mock.calls[0] as unknown[])[0] as { patch: { insuranceDetail: { relationship: string; subscriber: unknown } } }
    expect(call.patch.insuranceDetail.relationship).toBe('self')
    expect(call.patch.insuranceDetail.subscriber).toBeNull()
  })

  it('needs a carrier and member id', async () => {
    const r = await saveInsuranceToPatientAction('pat_1', { carrierName: '', memberId: 'x', groupNumber: null })
    expect(r.ok).toBe(false)
    expect(updatePatient).not.toHaveBeenCalled()
  })
})

describe('createPatientFromCheckAction', () => {
  it('creates the patient with the card on file and attaches the check', async () => {
    createPatient.mockResolvedValue({ id: 'pat_new' })
    const r = await createPatientFromCheckAction({ checkId: 'ins_1', request })
    expect(r).toEqual({ ok: true, id: 'pat_new' })
    expect(createPatient).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        firstName: 'Mia',
        lastName: 'Hayes',
        dateOfBirth: '1988-03-12',
        insuranceProvider: 'Delta Dental',
        insurancePolicyNumber: 'DD-100-2231',
        insuranceGroupNumber: 'G1',
        insuranceDetail: expect.objectContaining({ memberId: 'DD-100-2231', source: 'staff' }),
        source: 'manual',
        lifecycle: 'new',
        forceNew: false,
      }),
    )
    expect(attachInsuranceCheckToPatient).toHaveBeenCalledWith('org_1', 'ins_1', 'pat_new')
  })

  it('surfaces a duplicate instead of creating, and forceNew rides through on Add anyway', async () => {
    createPatient.mockResolvedValueOnce({ duplicateOf: { id: 'pat_dup', name: 'Mia Hayes' } })
    const r = await createPatientFromCheckAction({ checkId: 'ins_1', request })
    expect(r).toEqual({ ok: false, duplicateOf: { id: 'pat_dup', name: 'Mia Hayes' } })
    expect(attachInsuranceCheckToPatient).not.toHaveBeenCalled()

    createPatient.mockResolvedValueOnce({ id: 'pat_new2' })
    await createPatientFromCheckAction({ checkId: 'ins_1', request, forceNew: true })
    expect(createPatient).toHaveBeenLastCalledWith(expect.objectContaining({ forceNew: true }))
  })

  it('a thrown create becomes a typed error', async () => {
    createPatient.mockRejectedValueOnce(new Error('boom'))
    const r = await createPatientFromCheckAction({ checkId: 'ins_1', request })
    expect(r).toEqual({ ok: false, error: 'boom' })
  })
})
