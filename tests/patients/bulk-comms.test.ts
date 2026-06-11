import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Bulk patient email now routes through the SAME delivery path as a Patient
 * Communications email — `sendPatientMessageEmail` (which goes through
 * `deliver()` in lib/email.ts, inspects Resend's `{ error }`, and throws on a
 * real failure) — with the clinic sender identity from `getClinicSenderIdentity`
 * (Tier-1 From on the verified domain + deliverable Reply-To). It no longer
 * news up a raw Resend client or hardcodes a stale platform From.
 */

const { selectMock, sendMessageMock, getSenderMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  sendMessageMock: vi.fn().mockResolvedValue(undefined),
  getSenderMock: vi.fn(),
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

vi.mock('@/lib/email', () => ({
  sendPatientMessageEmail: sendMessageMock,
}))

vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: getSenderMock,
}))

const SENDER = {
  name: 'Acme Dental',
  from: 'Acme Dental <acme-dental@dreamcreatestudio.com>',
  replyTo: 'front@acmedental.com',
  timeZone: 'America/New_York',
}

beforeEach(() => {
  selectMock.mockReset()
  sendMessageMock.mockReset().mockResolvedValue(undefined)
  getSenderMock.mockReset().mockResolvedValue({ ...SENDER })
})

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
    expect(sendMessageMock).not.toHaveBeenCalled()
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
    expect(sendMessageMock).toHaveBeenCalledTimes(2)
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
    sendMessageMock
      .mockResolvedValueOnce(undefined)
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
    const call = sendMessageMock.mock.calls[0][0]
    expect(call.to).toBe('mia@x.com')
    // The patient first name is passed so sendPatientMessageEmail can greet by name.
    expect(call.patientFirstName).toBe('Mia')
    // Subject + body both reach the recipient (subject leads the body since the
    // 1:1 message subject header is the clinic-message convention).
    expect(call.body).toContain('Reminder')
    expect(call.body).toContain('Time for your visit.')
  })

  it('routes through the clinic sender identity (From + deliverable Reply-To)', async () => {
    selectMock.mockResolvedValueOnce([
      { id: 'p1', firstName: 'Mia', lastName: 'Hayes', email: 'mia@x.com', isActive: 1 },
    ])
    await sendBulkPatientEmail({
      organizationId: 'org_1',
      patientIds: ['p1'],
      subject: 'hi',
      body: 'body',
    })
    expect(getSenderMock).toHaveBeenCalledWith('org_1')
    const call = sendMessageMock.mock.calls[0][0]
    // Sends FROM the clinic's Tier-1 identity, NOT a hardcoded platform address.
    expect(call.from).toBe('Acme Dental <acme-dental@dreamcreatestudio.com>')
    expect(call.from).not.toMatch(/DreamCreateWeb\.com/i)
    // Reply-To is the clinic's deliverable inbox so a reply reaches the clinic.
    expect(call.replyTo).toBe('front@acmedental.com')
  })

  it('honors Tier-2 Gmail routing when the clinic has a connected mailbox', async () => {
    getSenderMock.mockResolvedValueOnce({
      ...SENDER,
      gmail: { accountId: 'acct_1', from: 'Acme Dental <front@acmedental.com>' },
    })
    selectMock.mockResolvedValueOnce([
      { id: 'p1', firstName: 'Mia', lastName: 'Hayes', email: 'mia@x.com', isActive: 1 },
    ])
    await sendBulkPatientEmail({
      organizationId: 'org_1',
      patientIds: ['p1'],
      subject: 'hi',
      body: 'body',
    })
    const call = sendMessageMock.mock.calls[0][0]
    expect(call.gmail).toEqual({ accountId: 'acct_1', from: 'Acme Dental <front@acmedental.com>' })
  })

  it('uses the clinic display name as the From name when fromName is provided', async () => {
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
    const call = sendMessageMock.mock.calls[0][0]
    expect(call.clinicName).toBe('Acme Dental')
  })
})
