import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Broadcast messaging — segment resolution (dedupe, clinic-local windows) and
 * send orchestration (guards, cap → campaigns nudge, per-recipient error
 * isolation, thread rails via sendMessageToPatient).
 */

const state = {
  selectQueue: [] as unknown[][],
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: { select: () => chain() },
    schema: {
      patient: {
        id: 'id', organizationId: 'org', firstName: 'fn', email: 'email',
        isActive: 'active', mergedIntoPatientId: 'merged', marketingEmailOptIn: 'opt',
      },
      appointment: { organizationId: 'org', patientId: 'pid', status: 'status', startTime: 'start' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lt: vi.fn(() => ({})),
  ne: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
}))
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))

const { sendMessageToPatientMock } = vi.hoisted(() => ({
  sendMessageToPatientMock: vi.fn(async () => ({ threadId: 't1', messageId: 'm1' })),
}))
vi.mock('@/lib/services/patient-messaging', () => ({
  sendMessageToPatient: sendMessageToPatientMock,
}))

import { resolveBroadcastRecipients, sendBroadcast } from '@/lib/services/broadcast'
import { BROADCAST_MAX_RECIPIENTS } from '@/lib/types/broadcast'

const NOW = new Date('2026-07-02T15:00:00Z')

beforeEach(() => {
  state.selectQueue = []
  vi.clearAllMocks()
})

describe('resolveBroadcastRecipients', () => {
  it('dedupes a patient with two visits in the window', async () => {
    state.selectQueue.push([
      { patientId: 'p1', firstName: 'Mia', email: 'mia@x.com' },
      { patientId: 'p1', firstName: 'Mia', email: 'mia@x.com' },
      { patientId: 'p2', firstName: 'Noah', email: 'noah@x.com' },
    ])
    const r = await resolveBroadcastRecipients('org_1', 'visits_week', NOW)
    expect(r).toHaveLength(2)
    expect(r.map((x) => x.patientId)).toEqual(['p1', 'p2'])
  })

  it('all_active reads straight off the patient table (opt-in filtered in SQL)', async () => {
    state.selectQueue.push([{ patientId: 'p1', firstName: 'Mia', email: 'mia@x.com' }])
    const r = await resolveBroadcastRecipients('org_1', 'all_active', NOW)
    expect(r).toEqual([{ patientId: 'p1', firstName: 'Mia', email: 'mia@x.com' }])
  })
})

describe('sendBroadcast', () => {
  it('sends the message to every recipient through the thread rails', async () => {
    state.selectQueue.push([
      { patientId: 'p1', firstName: 'Mia', email: 'mia@x.com' },
      { patientId: 'p2', firstName: 'Noah', email: 'noah@x.com' },
    ])
    const r = await sendBroadcast({
      organizationId: 'org_1',
      segment: 'visits_today',
      body: 'We’re closed today due to weather — we’ll reach out to reschedule.',
      sentByUserId: 'user_1',
      now: NOW,
    })
    expect(r).toMatchObject({ ok: true, attempted: 2, sent: 2, failed: 0 })
    expect(sendMessageToPatientMock).toHaveBeenCalledTimes(2)
    expect(sendMessageToPatientMock).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: 'p1', channel: 'email', sentByUserId: 'user_1' }),
    )
  })

  it('one failed recipient never aborts the rest', async () => {
    state.selectQueue.push([
      { patientId: 'p1', firstName: 'Mia', email: 'bad@x.com' },
      { patientId: 'p2', firstName: 'Noah', email: 'noah@x.com' },
    ])
    sendMessageToPatientMock.mockRejectedValueOnce(new Error('bounce'))
    const r = await sendBroadcast({
      organizationId: 'org_1', segment: 'visits_today', body: 'Hi', sentByUserId: 'u1', now: NOW,
    })
    expect(r).toMatchObject({ ok: true, sent: 1, failed: 1 })
    if (r.ok) expect(r.errors[0]).toMatchObject({ patientId: 'p1', error: 'bounce' })
  })

  it('an empty segment is a friendly error, not a silent no-op', async () => {
    state.selectQueue.push([])
    const r = await sendBroadcast({
      organizationId: 'org_1', segment: 'visits_today', body: 'Hi', sentByUserId: 'u1', now: NOW,
    })
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('No one') })
    expect(sendMessageToPatientMock).not.toHaveBeenCalled()
  })

  it('over the cap → points at Recall & Outreach campaigns instead of sending', async () => {
    state.selectQueue.push(
      [Array.from({ length: BROADCAST_MAX_RECIPIENTS + 1 }, (_, i) => ({
        patientId: `p${i}`, firstName: 'P', email: `p${i}@x.com`,
      }))].flat(),
    )
    const r = await sendBroadcast({
      organizationId: 'org_1', segment: 'all_active', body: 'Hi', sentByUserId: 'u1', now: NOW,
    })
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('campaign') })
    expect(sendMessageToPatientMock).not.toHaveBeenCalled()
  })

  it('requires a message body', async () => {
    const r = await sendBroadcast({
      organizationId: 'org_1', segment: 'visits_today', body: '   ', sentByUserId: 'u1', now: NOW,
    })
    expect(r).toMatchObject({ ok: false })
    expect(state.selectQueue).toHaveLength(0) // rejected before any query
  })
})
