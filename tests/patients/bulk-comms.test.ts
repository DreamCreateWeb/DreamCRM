import { describe, it, expect, vi, beforeEach } from 'vitest'

const { selectMock, sendMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  sendMock: vi.fn().mockResolvedValue({ id: 'm_1' }),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => selectMock(),
      }),
    }),
  },
  schema: {
    patient: {
      organizationId: 'organizationId',
      id: 'id',
    },
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _kind: 'and' })),
  eq: vi.fn(() => ({ _kind: 'eq' })),
  inArray: vi.fn(() => ({ _kind: 'inArray' })),
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))

const ORIGINAL_ENV = process.env.RESEND_API_KEY
beforeEach(() => {
  process.env.RESEND_API_KEY = 'test_key'
  selectMock.mockReset()
  sendMock.mockReset().mockResolvedValue({ id: 'm_1' })
})
afterEachRestore()

function afterEachRestore() {
  // Restore RESEND_API_KEY after the file. We don't import afterAll vs
  // afterEach to keep this simple — Vitest's beforeEach already resets.
  if (ORIGINAL_ENV) process.env.RESEND_API_KEY = ORIGINAL_ENV
}

import { sendBulkPatientEmail } from '@/lib/services/patient-bulk-comms'

describe('sendBulkPatientEmail', () => {
  it('returns 0/0/0 when patientIds is empty', async () => {
    const r = await sendBulkPatientEmail({
      organizationId: 'org_1',
      patientIds: [],
      subject: 'hi',
      body: 'body',
    })
    expect(r).toEqual({
      attempted: 0,
      sent: 0,
      skippedNoEmail: 0,
      skippedArchived: 0,
      errors: [],
    })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sends one email per reachable patient', async () => {
    selectMock.mockResolvedValueOnce([
      { id: 'p1', firstName: 'Mia', lastName: 'Hayes', email: 'mia@x.com', isActive: 1 },
      { id: 'p2', firstName: 'Liam', lastName: 'Brooks', email: 'liam@x.com', isActive: 1 },
    ])
    const r = await sendBulkPatientEmail({
      organizationId: 'org_1',
      patientIds: ['p1', 'p2'],
      subject: 'Time for a cleaning',
      body: 'Click below to book.',
    })
    expect(r.sent).toBe(2)
    expect(r.skippedNoEmail).toBe(0)
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it('skips patients without an email', async () => {
    selectMock.mockResolvedValueOnce([
      { id: 'p1', firstName: 'Mia', lastName: 'Hayes', email: null, isActive: 1 },
      { id: 'p2', firstName: 'Liam', lastName: 'Brooks', email: 'liam@x.com', isActive: 1 },
    ])
    const r = await sendBulkPatientEmail({
      organizationId: 'org_1',
      patientIds: ['p1', 'p2'],
      subject: 'hi',
      body: 'body',
    })
    expect(r.sent).toBe(1)
    expect(r.skippedNoEmail).toBe(1)
  })

  it('skips archived (isActive=0) patients', async () => {
    selectMock.mockResolvedValueOnce([
      { id: 'p1', firstName: 'Mia', lastName: 'Hayes', email: 'mia@x.com', isActive: 0 },
    ])
    const r = await sendBulkPatientEmail({
      organizationId: 'org_1',
      patientIds: ['p1'],
      subject: 'hi',
      body: 'body',
    })
    expect(r.sent).toBe(0)
    expect(r.skippedArchived).toBe(1)
  })

  it('captures per-recipient errors without aborting the batch', async () => {
    selectMock.mockResolvedValueOnce([
      { id: 'p1', firstName: 'Mia', lastName: 'Hayes', email: 'mia@x.com', isActive: 1 },
      { id: 'p2', firstName: 'Liam', lastName: 'Brooks', email: 'liam@x.com', isActive: 1 },
    ])
    sendMock
      .mockResolvedValueOnce({ id: 'ok' })
      .mockRejectedValueOnce(new Error('Resend 500'))
    const r = await sendBulkPatientEmail({
      organizationId: 'org_1',
      patientIds: ['p1', 'p2'],
      subject: 'hi',
      body: 'body',
    })
    expect(r.sent).toBe(1)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toMatchObject({ patientId: 'p2' })
  })

  it('personalizes each send with the patient first name', async () => {
    selectMock.mockResolvedValueOnce([
      { id: 'p1', firstName: 'Mia', lastName: 'Hayes', email: 'mia@x.com', isActive: 1 },
    ])
    await sendBulkPatientEmail({
      organizationId: 'org_1',
      patientIds: ['p1'],
      subject: 'Reminder',
      body: 'Time for your visit.',
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.to).toBe('mia@x.com')
    expect(call.html).toContain('Hi Mia,')
  })

  it('uses the clinic display name in the from line when provided', async () => {
    selectMock.mockResolvedValueOnce([
      { id: 'p1', firstName: 'Mia', lastName: 'Hayes', email: 'mia@x.com', isActive: 1 },
    ])
    await sendBulkPatientEmail({
      organizationId: 'org_1',
      patientIds: ['p1'],
      subject: 'hi',
      body: 'body',
      fromName: 'Acme Dental',
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.from).toContain('Acme Dental')
  })
})
