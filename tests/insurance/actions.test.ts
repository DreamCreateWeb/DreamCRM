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
  platformAdmin: false,
}
vi.mock('@/lib/auth/context', () => ({ requireTenant: vi.fn(async () => tenantCtx) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const runEligibilityCheck = vi.fn()
const attachInsuranceCheckToPatient = vi.fn(async () => true)
const searchPayers = vi.fn(async () => [{ primaryPayerId: '77777', displayName: 'Delta Dental of California' }])
const enableInsuranceTool = vi.fn(async () => ({ ok: true as const, enabledAt: new Date(), npi: null }))
const disableInsuranceTool = vi.fn(async () => true)
vi.mock('@/lib/services/insurance-eligibility', () => ({
  runEligibilityCheck: (...a: unknown[]) => runEligibilityCheck(...(a as [])),
  attachInsuranceCheckToPatient: (...a: unknown[]) => attachInsuranceCheckToPatient(...(a as [])),
  searchPayers: (...a: unknown[]) => searchPayers(...(a as [])),
  enableInsuranceTool: (...a: unknown[]) => enableInsuranceTool(...(a as [])),
  disableInsuranceTool: (...a: unknown[]) => disableInsuranceTool(...(a as [])),
}))

const createPatient = vi.fn()
const updatePatient = vi.fn(async () => undefined)
vi.mock('@/lib/services/patients', () => ({
  createPatient: (...a: unknown[]) => createPatient(...(a as [])),
  updatePatient: (...a: unknown[]) => updatePatient(...(a as [])),
}))
const readInsuranceCard = vi.fn()
vi.mock('@/lib/services/insurance-ocr', () => ({
  readInsuranceCard: (...a: unknown[]) => readInsuranceCard(...(a as [])),
}))
vi.mock('@/lib/attachment-hosts', () => ({
  isAllowedAttachmentUrl: (u: string) => u.startsWith('https://dreamcrm-uploads-prod.s3.amazonaws.com/'),
}))
const addPatientDocument = vi.fn(async () => ({ id: 'doc_1' }))
const patientBelongsToOrg = vi.fn(async () => true)
const getPayerNote = vi.fn(async () => null as unknown)
const savePayerNote = vi.fn(async () => ({ id: 'pnote_1', payerKey: 'id:77777', payerId: '77777', payerName: 'Delta Dental of California', feeSchedule: 'PPO', network: 'in', paysOn: null, claimsAddress: null, phone: null, notes: null, updatedAtIso: '2026-10-08T15:00:00.000Z', updatedByName: 'Mary' }))
vi.mock('@/lib/services/insurance-eligibility/payer-notebook', () => ({
  getPayerNote: (...a: unknown[]) => getPayerNote(...(a as [])),
  savePayerNote: (...a: unknown[]) => savePayerNote(...(a as [])),
}))
vi.mock('@/lib/services/patient-documents', () => ({
  addPatientDocument: (...a: unknown[]) => addPatientDocument(...(a as [])),
  patientBelongsToOrg: (...a: unknown[]) => patientBelongsToOrg(...(a as [])),
}))

import {
  checkInsuranceAction,
  createPatientFromCheckAction,
  disableInsuranceAction,
  enableInsuranceAction,
  scanCardAction,
  saveInsuranceToPatientAction,
  searchPayersAction,
  getPayerNoteAction,
  savePayerNoteAction,
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
  tenantCtx.tenantType = 'clinic'
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
    tenantCtx.tenantType = 'platform'
    expect((await searchPayersAction('Delta')).ok).toBe(false)
    tenantCtx.tenantType = 'clinic'
  })

  it('a clinic feature: refuses the platform tenant — every action (released to every clinic 2026-10-03)', async () => {
    tenantCtx.tenantType = 'platform'
    expect((await checkInsuranceAction(request, null)).ok).toBe(false)
    expect((await saveInsuranceToPatientAction('pat_1', { carrierName: 'X', memberId: 'Y', groupNumber: null })).ok).toBe(false)
    expect((await createPatientFromCheckAction({ checkId: 'ins_1', request })).ok).toBe(false)
    expect(runEligibilityCheck).not.toHaveBeenCalled()
    expect(updatePatient).not.toHaveBeenCalled()
    expect(createPatient).not.toHaveBeenCalled()
    tenantCtx.tenantType = 'clinic'
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

describe('scanCardAction', () => {
  const img = { url: 'https://dreamcrm-uploads-prod.s3.amazonaws.com/insurance-cards/u/1-front.jpg', name: 'front.jpg', contentType: 'image/jpeg', sizeBytes: 123_456 }

  beforeEach(() => {
    readInsuranceCard.mockReset()
    addPatientDocument.mockClear()
    patientBelongsToOrg.mockClear()
    patientBelongsToOrg.mockResolvedValue(true)
  })

  it('reads the card through the metered OCR, returns the fields, and keeps the photo on the selected patient’s record', async () => {
    readInsuranceCard.mockResolvedValue({ ok: true, fields: { provider: 'Delta Dental', memberId: 'DD-1', groupNumber: 'G1', planName: 'PPO', subscriberName: 'Ana Hayes' } })
    const r = await scanCardAction({ images: [img, { ...img, url: `${img.url}?back`, name: 'back.jpg' }], patientId: 'pat_1' })
    expect(r).toMatchObject({ ok: true, attached: 2 })
    expect(readInsuranceCard).toHaveBeenCalledWith({ organizationId: 'org_1', imageUrls: [img.url, `${img.url}?back`] })
    expect(addPatientDocument).toHaveBeenCalledTimes(2)
    expect((addPatientDocument.mock.calls[0] as unknown[])[0]).toMatchObject({ organizationId: 'org_1', patientId: 'pat_1', uploadedBy: 'user_staff', fileUrl: img.url, contentType: 'image/jpeg', sizeBytes: 123_456, label: 'Insurance card (front)' })
  })

  it('attaches nothing without a patient, or when the patient is not this org’s — and the scan still answers', async () => {
    readInsuranceCard.mockResolvedValue({ ok: true, fields: { provider: 'Cigna', memberId: null, groupNumber: null, planName: null, subscriberName: null } })
    const none = await scanCardAction({ images: [img], patientId: null })
    expect(none).toMatchObject({ ok: true, attached: 0 })
    patientBelongsToOrg.mockResolvedValue(false)
    const foreign = await scanCardAction({ images: [img], patientId: 'pat_other' })
    expect(foreign).toMatchObject({ ok: true, attached: 0 })
    expect(addPatientDocument).not.toHaveBeenCalled()
  })

  it('refuses non-image uploads and photos off our storage before any read, and words every OCR refusal for the desk', async () => {
    const pdf = await scanCardAction({ images: [{ ...img, contentType: 'application/pdf' }], patientId: null })
    expect(pdf.ok).toBe(false)
    // A foreign URL is dropped BEFORE the read — and so can never be kept on a record as a document.
    const foreign = await scanCardAction({ images: [{ ...img, url: 'https://attacker.example/card.jpg' }], patientId: 'pat_1' })
    expect(foreign.ok).toBe(false)
    expect(addPatientDocument).not.toHaveBeenCalled()
    expect(readInsuranceCard).not.toHaveBeenCalled()
    for (const reason of ['not_configured', 'no_allowance', 'no_images', 'failed'] as const) {
      readInsuranceCard.mockResolvedValueOnce({ ok: false, reason })
      const r = await scanCardAction({ images: [img], patientId: null })
      expect(r.ok).toBe(false)
      expect((r as { error: string }).error).toMatch(/type it in from the card/i)
    }
  })

  it('a clinic feature: refuses a patient tenant', async () => {
    tenantCtx.tenantType = 'patient'
    const r = await scanCardAction({ images: [img], patientId: null })
    expect(r.ok).toBe(false)
    expect(readInsuranceCard).not.toHaveBeenCalled()
    tenantCtx.tenantType = 'clinic'
  })
})

describe('the ON switch (self-serve setup, 2026-10-05)', () => {
  beforeEach(() => {
    enableInsuranceTool.mockClear()
    disableInsuranceTool.mockClear()
    tenantCtx.role = 'owner'
    delete process.env.INSURANCE_DRIVER
    delete process.env.STEDI_MODE
  })

  it('an owner or admin turns it on, with the typed NPI passed through; the live driver REQUIRES the NPI', async () => {
    expect((await enableInsuranceAction({ npi: '123-456-7893' })).ok).toBe(true)
    expect(enableInsuranceTool).toHaveBeenCalledWith('org_1', { npi: '123-456-7893', requireNpi: false })
    tenantCtx.role = 'admin'
    process.env.INSURANCE_DRIVER = 'stedi'
    process.env.STEDI_MODE = 'live'
    expect((await enableInsuranceAction({ npi: '' })).ok).toBe(true)
    expect(enableInsuranceTool).toHaveBeenLastCalledWith('org_1', { npi: '', requireNpi: true })
  })

  it('a member cannot turn it on or off; neither can a non-clinic tenant', async () => {
    tenantCtx.role = 'member'
    expect((await enableInsuranceAction({ npi: '1234567893' })).ok).toBe(false)
    expect((await disableInsuranceAction()).ok).toBe(false)
    tenantCtx.role = 'owner'
    tenantCtx.tenantType = 'platform'
    expect((await enableInsuranceAction({ npi: '1234567893' })).ok).toBe(false)
    tenantCtx.tenantType = 'clinic'
    expect(enableInsuranceTool).not.toHaveBeenCalled()
    expect(disableInsuranceTool).not.toHaveBeenCalled()
  })

  it('the service’s refusal (a bad NPI) comes back as the form error; turning off is an owner/admin one-liner', async () => {
    enableInsuranceTool.mockResolvedValueOnce({ ok: false, error: 'An NPI is ten digits' } as never)
    const r = await enableInsuranceAction({ npi: '12' })
    expect(r.ok).toBe(false)
    expect((r as { error: string }).error).toMatch(/ten digits/)
    expect((await disableInsuranceAction()).ok).toBe(true)
    expect(disableInsuranceTool).toHaveBeenCalledWith('org_1')
  })
})

describe('the payer notebook actions (2026-10-08)', () => {
  it('getPayerNoteAction reads under the session org and never throws to the card', async () => {
    getPayerNote.mockResolvedValueOnce({ id: 'pnote_1' })
    expect(await getPayerNoteAction('77777', 'Delta Dental of California')).toEqual({ id: 'pnote_1' })
    expect(getPayerNote).toHaveBeenCalledWith('org_1', '77777', 'Delta Dental of California')
    getPayerNote.mockRejectedValueOnce(new Error('db down'))
    expect(await getPayerNoteAction('77777', 'Delta')).toBeNull()
  })

  it('savePayerNoteAction validates, caps the payer id, writes under the session org with the writer, and returns the stored note', async () => {
    const r = await savePayerNoteAction({ payerId: '77777', payerName: ' Delta Dental of California ', fields: { feeSchedule: ' PPO ', network: 'in', paysOn: '', claimsAddress: '', phone: '', notes: '' } })
    expect(r.ok).toBe(true)
    expect(savePayerNote).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org_1', payerId: '77777', payerName: 'Delta Dental of California', userId: 'user_staff', fields: { feeSchedule: 'PPO', network: 'in', paysOn: null, claimsAddress: null, phone: null, notes: null } }))
    expect(r.ok && r.note.feeSchedule).toBe('PPO')
  })

  it('refuses a bad value, an unnamed payer, and every other tenant', async () => {
    expect(await savePayerNoteAction({ payerId: null, payerName: 'Delta', fields: { network: 'sideways' } })).toMatchObject({ ok: false })
    expect(await savePayerNoteAction({ payerId: null, payerName: '  ', fields: {} })).toMatchObject({ ok: false, error: 'Name the payer first.' })
    savePayerNote.mockClear()
    tenantCtx.tenantType = 'platform'
    expect(await getPayerNoteAction('77777', 'Delta')).toBeNull()
    expect(await savePayerNoteAction({ payerId: '77777', payerName: 'Delta', fields: {} })).toMatchObject({ ok: false })
    expect(savePayerNote).not.toHaveBeenCalled()
    tenantCtx.tenantType = 'clinic'
  })
})
