import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Guard coverage for sendPortalMessageAction — the only write path a
 * patient role can hit on the portal messages surface. Verifies the
 * tenant gate, the portal feature flag (clinic toggled messages off),
 * body validation, and error surfacing.
 */

const tenantCtx = {
  tenantType: 'patient' as 'patient' | 'clinic' | 'platform',
  organizationId: 'org_1',
  patientId: 'pat_1' as string | null,
  organizationName: 'Acme',
  userId: 'usr_1',
  userEmail: 'mia@example.com',
  userName: 'Mia',
  role: 'patient' as string,
  platformAdmin: false as boolean,
  planTier: null,
}

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => tenantCtx),
}))

const sendMessageFromPatient = vi.fn(async () => ({ threadId: 'thr_1', messageId: 'msg_1' }))
vi.mock('@/lib/services/patient-portal', () => ({
  sendMessageFromPatient: (...args: unknown[]) => sendMessageFromPatient(...(args as [])),
  getAccessiblePatientIds: vi.fn(async () => ['pat_1']),
  getVisitForPatients: vi.fn(async () => null),
}))

const settings = {
  features: { messages: true } as Record<string, boolean>,
}
vi.mock('@/lib/services/portal-settings', () => ({
  getPortalSettings: vi.fn(async () => settings),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/db/schema/clinic', () => ({ appointment: {}, patient: {} }))
vi.mock('@/lib/services/appointments', () => ({
  confirmAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
}))
vi.mock('@/lib/services/booking', () => ({
  getSlotsForDay: vi.fn(),
  isSlotAvailable: vi.fn(),
  SLOT_MINUTES: 30,
}))
vi.mock('@/lib/services/pms', () => ({ queueAppointmentWriteBack: vi.fn() }))
vi.mock('@/lib/services/booking-confirmation', () => ({ sendBookingConfirmation: vi.fn() }))

beforeEach(() => {
  tenantCtx.tenantType = 'patient'
  tenantCtx.patientId = 'pat_1'
  settings.features.messages = true
  sendMessageFromPatient.mockClear()
})

async function callAction(body: string) {
  const { sendPortalMessageAction } = await import('@/app/(portal)/patient/actions')
  return sendPortalMessageAction(body)
}

describe('sendPortalMessageAction', () => {
  it('sends the message on the happy path', async () => {
    const r = await callAction('Hi, can I reschedule?')
    expect(r).toEqual({ ok: true })
    expect(sendMessageFromPatient).toHaveBeenCalledWith('org_1', 'pat_1', 'Hi, can I reschedule?', [])
  })

  it('throws when caller is not a patient tenant', async () => {
    tenantCtx.tenantType = 'clinic'
    await expect(callAction('test')).rejects.toThrow('Only patients can use the portal')
    expect(sendMessageFromPatient).not.toHaveBeenCalled()
  })

  it('throws when patient identity is missing', async () => {
    tenantCtx.patientId = null
    await expect(callAction('test')).rejects.toThrow('Only patients can use the portal')
    expect(sendMessageFromPatient).not.toHaveBeenCalled()
  })

  it('rejects when the clinic toggled messages off', async () => {
    settings.features.messages = false
    const r = await callAction('test')
    expect(r).toEqual({
      ok: false,
      error: 'Messaging isn’t available — give us a call instead.',
    })
    expect(sendMessageFromPatient).not.toHaveBeenCalled()
  })

  it('rejects empty body without calling the service', async () => {
    const r = await callAction('   ')
    expect(r).toEqual({ ok: false, error: 'Write a message or add a photo first.' })
    expect(sendMessageFromPatient).not.toHaveBeenCalled()
  })

  it('surfaces service errors as { ok:false }', async () => {
    sendMessageFromPatient.mockRejectedValueOnce(new Error('downstream boom'))
    const r = await callAction('test')
    expect(r).toEqual({ ok: false, error: 'downstream boom' })
  })
})
