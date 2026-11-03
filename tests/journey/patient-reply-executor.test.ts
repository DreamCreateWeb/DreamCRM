import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE PATIENT-REPLY EXECUTOR (ML-12). Pins the executor's own contract —
 * the approve wrapper's narrate-once / reopen / atomic-claim laws are
 * pinned through approveProposal in tests/journey/proposals-service.test.ts:
 *  - the yes sends ONCE through sendMessageToPatient (the Messages page's
 *    one send) AS THE APPROVER, on the channel the card disclosed;
 *  - live staleness at the tap: answered at the counter → retire; our own
 *    words already on the thread → retire + recovery-narrate, never re-send;
 *    the patient wrote again → retire so the newest message gets drafted;
 *  - an unreadable history never vetoes the yes; a missing email at send
 *    time is a reopen-with-advice, not a retire;
 *  - no approver (the lane is not grantable) → refuse before any send.
 */

const messaging = vi.hoisted(() => ({
  thread: null as Record<string, unknown> | null,
  messages: [] as Array<Record<string, unknown>>,
  historyThrows: false,
  sendThrows: null as string | null,
  send: vi.fn(async (..._a: unknown[]) => ({ threadId: 'thr_1', messageId: 'm_sent' })),
}))
vi.mock('@/lib/services/patient-messaging', () => ({
  getPatientThreadById: vi.fn(async () => messaging.thread),
  listMessagesInThread: vi.fn(async () => {
    if (messaging.historyThrows) throw new Error('history read down')
    return messaging.messages
  }),
  sendMessageToPatient: vi.fn(async (input: Record<string, unknown>) => {
    if (messaging.sendThrows) throw new Error(messaging.sendThrows)
    return messaging.send(input)
  }),
}))

import { executePatientReply } from '@/lib/services/proposal-executors/patient-reply'

const ORG = 'org_1'
const BODY = 'Hi Mia — Thursday at 2 works. See you then!'

function proposal(over: Record<string, unknown> = {}) {
  return {
    id: 'prop_1',
    organizationId: ORG,
    capability: 'patient_reply',
    patientId: 'pat_1',
    sourceKey: 'patient_reply:thr_1:m_last',
    title: 'Reply to Mia',
    body: BODY,
    payload: { threadId: 'thr_1', messageId: 'm_last', channel: 'in_app' },
    originalBody: null,
    status: 'approved',
    decidedAt: new Date(),
    decidedByUserId: 'user_1',
    executedAt: null,
    expiresAt: null,
    isDemo: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as unknown as Parameters<typeof executePatientReply>[0]
}

const SAID_YES = '— you approved it'

beforeEach(() => {
  messaging.thread = {
    id: 'thr_1',
    patientId: 'pat_1',
    patientFirstName: 'Mia',
    patientLastName: 'Chen',
    patientEmail: 'mia@example.com',
    status: 'open',
    lastMessageDirection: 'inbound',
  }
  messaging.messages = [
    { id: 'm_out', direction: 'outbound', channel: 'in_app', body: 'Booked for the 30th.' },
    { id: 'm_last', direction: 'inbound', channel: 'in_app', body: 'Can I move it to Thursday?' },
  ]
  messaging.historyThrows = false
  messaging.sendThrows = null
  messaging.send.mockClear()
})

describe('the yes', () => {
  it('sends ONCE through the Messages page’s send, as the approver, on the disclosed channel, and narrates under patient_reply', async () => {
    const p = proposal()
    const r = await executePatientReply(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toMatchObject({ ok: true })
    expect(messaging.send).toHaveBeenCalledTimes(1)
    expect(messaging.send).toHaveBeenCalledWith({
      organizationId: ORG,
      patientId: 'pat_1',
      body: BODY,
      channel: 'in_app',
      sentByUserId: 'user_1',
    })
    if (r.ok) {
      expect(r.ledgerSummary).toBe('Replied to Mia’s message in the portal — you approved it')
      expect(r.ledgerDetail).toEqual({ threadId: 'thr_1', messageId: 'm_sent', channel: 'in_app' })
    }
  })

  it('an email card sends by email', async () => {
    const p = proposal({ payload: { threadId: 'thr_1', messageId: 'm_last', channel: 'email' } })
    const r = await executePatientReply(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r.ok).toBe(true)
    expect(messaging.send.mock.calls[0][0]).toMatchObject({ channel: 'email' })
    if (r.ok) expect(r.ledgerSummary).toContain('by email')
  })

  it('an unreadable history never vetoes the yes', async () => {
    messaging.historyThrows = true
    const p = proposal()
    const r = await executePatientReply(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r.ok).toBe(true)
    expect(messaging.send).toHaveBeenCalledTimes(1)
  })

  it('a send failure comes back as the service’s own words — reopen, not retire, nothing sent', async () => {
    messaging.sendThrows = 'This patient has no email address on file — switch to the in-app channel.'
    const p = proposal({ payload: { threadId: 'thr_1', messageId: 'm_last', channel: 'email' } })
    const r = await executePatientReply(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('no email address on file') })
    if (!r.ok) expect(r.expired).toBeUndefined()
  })
})

describe('live staleness at the tap', () => {
  it('answered at the counter since filing → retires, never sends', async () => {
    messaging.thread!.lastMessageDirection = 'outbound'
    messaging.messages.push({ id: 'm_hand', direction: 'outbound', channel: 'in_app', body: 'Dana here — yes, Thursday is fine.' })
    const p = proposal()
    const r = await executePatientReply(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toMatchObject({ ok: false, expired: true, error: expect.stringContaining('already answered Mia') })
    if (!r.ok) expect(r.recovered).toBeUndefined()
    expect(messaging.send).not.toHaveBeenCalled()
  })

  it('OUR OWN words already on the thread (a stranded approve) → retires and recovery-narrates once, never re-sends', async () => {
    messaging.thread!.lastMessageDirection = 'outbound'
    messaging.messages.push({ id: 'm_ours', direction: 'outbound', channel: 'in_app', body: `${BODY}  ` })
    const p = proposal()
    const r = await executePatientReply(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.expired).toBe(true)
      expect(r.recovered).toEqual({
        ledgerSummary: 'Replied to Mia’s message',
        ledgerDetail: { threadId: 'thr_1', messageId: 'm_ours', channel: 'in_app' },
      })
    }
    expect(messaging.send).not.toHaveBeenCalled()
  })

  it('the patient wrote again since the draft → retires so the newest message gets drafted', async () => {
    messaging.messages.push({ id: 'm_newer', direction: 'inbound', channel: 'in_app', body: 'Actually, Friday?' })
    const p = proposal()
    const r = await executePatientReply(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toMatchObject({ ok: false, expired: true, error: expect.stringContaining('wrote again') })
    expect(messaging.send).not.toHaveBeenCalled()
  })

  it('an archived thread retires the card', async () => {
    messaging.thread!.status = 'archived'
    const p = proposal()
    const r = await executePatientReply(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toMatchObject({ ok: false, expired: true })
    expect(messaging.send).not.toHaveBeenCalled()
  })

  it('a vanished thread retires the card', async () => {
    messaging.thread = null
    const p = proposal()
    const r = await executePatientReply(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toMatchObject({ ok: false, expired: true })
    expect(messaging.send).not.toHaveBeenCalled()
  })

  it('an email card whose patient lost their address is a reopen with advice — the draft is still good', async () => {
    messaging.thread!.patientEmail = null
    const p = proposal({ payload: { threadId: 'thr_1', messageId: 'm_last', channel: 'email' } })
    const r = await executePatientReply(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('reply in the portal instead') })
    if (!r.ok) expect(r.expired).toBeUndefined()
    expect(messaging.send).not.toHaveBeenCalled()
  })
})

describe('guards', () => {
  it('no approver on the row → refuses before any read or send (the lane is not grantable)', async () => {
    const p = proposal({ decidedByUserId: null })
    const r = await executePatientReply(p, p.payload as Record<string, unknown>, SAID_YES)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('approves it') })
    expect(messaging.send).not.toHaveBeenCalled()
  })

  it('a card with no thread reference refuses', async () => {
    const p = proposal({ payload: {} })
    const r = await executePatientReply(p, {}, SAID_YES)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('conversation reference') })
  })
})
