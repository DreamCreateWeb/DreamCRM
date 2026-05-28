import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Guard coverage for sendPatientMessageAction. The action is the ONLY
 * write path a patient role can hit on the messages surface, so each
 * tenant-gate is verified.
 */

const tenantCtx = {
  tenantType: 'patient' as 'patient' | 'clinic' | 'platform',
  organizationId: 'org_1',
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

const sendMessageFromPatient = vi.fn(async () => ({ threadId: 'thr_1', messageId: 'msg_1' }))
vi.mock('@/lib/services/patient-portal', () => ({
  sendMessageFromPatient,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

beforeEach(() => {
  tenantCtx.tenantType = 'patient'
  tenantCtx.patientId = 'pat_1'
  sendMessageFromPatient.mockClear()
})

async function callAction(body: string) {
  const { sendPatientMessageAction } = await import('@/app/(default)/patient/messages/actions')
  return sendPatientMessageAction(body)
}

describe('sendPatientMessageAction', () => {
  it('sends the message and returns the threadId on the happy path', async () => {
    const r = await callAction('Hi, can I reschedule?')
    expect(r).toEqual({ ok: true, threadId: 'thr_1' })
    expect(sendMessageFromPatient).toHaveBeenCalledWith('org_1', 'pat_1', 'Hi, can I reschedule?')
  })

  it('rejects when caller is not a patient tenant', async () => {
    tenantCtx.tenantType = 'clinic'
    const r = await callAction('test')
    expect(r).toEqual({ ok: false, error: 'Only patients can send portal messages' })
    expect(sendMessageFromPatient).not.toHaveBeenCalled()
  })

  it('rejects when patient identity is missing', async () => {
    tenantCtx.patientId = null
    const r = await callAction('test')
    expect(r).toEqual({ ok: false, error: 'Missing patient identity' })
    expect(sendMessageFromPatient).not.toHaveBeenCalled()
  })

  it('rejects empty body without calling the service', async () => {
    const r = await callAction('   ')
    expect(r).toEqual({ ok: false, error: 'Message cannot be empty' })
    expect(sendMessageFromPatient).not.toHaveBeenCalled()
  })

  it('surfaces service errors as { ok:false }', async () => {
    sendMessageFromPatient.mockRejectedValueOnce(new Error('downstream boom'))
    const r = await callAction('test')
    expect(r).toEqual({ ok: false, error: 'downstream boom' })
  })
})
