import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tenant + cross-org guards for submitPatientIntakeAction. The patient
 * portal submits to /patient/intake using the SESSION orgId, never the
 * orgId from the client, so a curious patient can't post against a
 * different clinic's templates.
 */

const tenantCtx = {
  tenantType: 'patient' as 'patient' | 'clinic' | 'platform',
  organizationId: 'org_real',
  patientId: 'pat_1' as string | null,
  organizationName: 'Acme',
  userId: 'usr_1',
  role: 'patient' as string,
  platformAdmin: false as boolean,
  planTier: null,
}

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => tenantCtx),
}))

const getFormTemplate = vi.fn()
const submitForm = vi.fn()
vi.mock('@/lib/services/forms', () => ({
  getFormTemplate,
  submitForm,
}))

beforeEach(() => {
  tenantCtx.tenantType = 'patient'
  tenantCtx.patientId = 'pat_1'
  tenantCtx.organizationId = 'org_real'
  getFormTemplate.mockReset()
  submitForm.mockReset()
})

async function call(input: Parameters<typeof import('@/app/(default)/patient/intake/actions').submitPatientIntakeAction>[0]) {
  const { submitPatientIntakeAction } = await import('@/app/(default)/patient/intake/actions')
  return submitPatientIntakeAction(input)
}

const baseInput = {
  orgId: 'org_real',
  templateId: 'ft_1',
  data: { name: 'Mia' },
  submitterName: 'Mia Hayes',
  submitterEmail: 'mia@example.com',
  submitterPhone: '555-0100',
}

describe('submitPatientIntakeAction', () => {
  it('submits on the happy path with session-bound orgId + patientId', async () => {
    getFormTemplate.mockResolvedValueOnce({ id: 'ft_1', archivedAt: null })
    submitForm.mockResolvedValueOnce({ id: 'sub_1' })
    await call(baseInput)
    expect(submitForm).toHaveBeenCalledWith({
      organizationId: 'org_real',
      formTemplateId: 'ft_1',
      patientId: 'pat_1',
      data: { name: 'Mia' },
      submitterName: 'Mia Hayes',
      submitterEmail: 'mia@example.com',
      submitterPhone: '555-0100',
    })
  })

  it('rejects when the tenant context is not a patient', async () => {
    tenantCtx.tenantType = 'clinic'
    await expect(call(baseInput)).rejects.toThrow(/Only patients can submit/i)
    expect(submitForm).not.toHaveBeenCalled()
  })

  it('rejects when patient identity is missing', async () => {
    tenantCtx.patientId = null
    await expect(call(baseInput)).rejects.toThrow(/Missing patient identity/i)
    expect(submitForm).not.toHaveBeenCalled()
  })

  it('ignores a spoofed orgId from the client and uses the session orgId', async () => {
    getFormTemplate.mockResolvedValueOnce({ id: 'ft_1', archivedAt: null })
    submitForm.mockResolvedValueOnce({ id: 'sub_1' })
    await call({ ...baseInput, orgId: 'org_attacker' })
    // The cross-org check uses ctx.organizationId, not input.orgId:
    expect(getFormTemplate).toHaveBeenCalledWith('org_real', 'ft_1')
    expect(submitForm).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org_real' }))
  })

  it('rejects when the template is archived', async () => {
    getFormTemplate.mockResolvedValueOnce({ id: 'ft_1', archivedAt: new Date() })
    await expect(call(baseInput)).rejects.toThrow(/no longer accepting/i)
    expect(submitForm).not.toHaveBeenCalled()
  })

  it('rejects when the template does not belong to the session org', async () => {
    getFormTemplate.mockResolvedValueOnce(null)
    await expect(call(baseInput)).rejects.toThrow(/no longer accepting/i)
    expect(submitForm).not.toHaveBeenCalled()
  })
})
