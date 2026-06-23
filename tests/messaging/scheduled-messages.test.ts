import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Scheduled (send-later) patient messages. Covers the validation gate
 * (channel / body-or-attachment / time window / cross-tenant), and the cron
 * flush (atomic claim → send each → mark sent, with a failure marking just
 * that row 'failed' and never blocking the rest).
 */

const sendMessageToPatient = vi.fn(async () => ({ threadId: 'thr_1', messageId: 'pmsg_new' }))
vi.mock('@/lib/services/patient-messaging', () => ({
  sendMessageToPatient: (...a: unknown[]) => sendMessageToPatient(...(a as [])),
}))

// A small controllable Drizzle stand-in. select→limit returns `selectResult`;
// insert captures values; update().set().where() captures; update().set()
// .where().returning() returns `claimResult`.
let selectResult: unknown[] = []
let claimResult: unknown[] = []
const inserted: unknown[] = []
const updates: Array<{ set: unknown }> = []

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectResult,
          orderBy: async () => selectResult,
        }),
      }),
    }),
    insert: () => ({ values: async (v: unknown) => { inserted.push(v) } }),
    update: () => ({
      set: (s: unknown) => {
        updates.push({ set: s })
        // The same value supports both `await …where()` (cancel / mark) and
        // `await …where().returning()` (the atomic claim).
        const p: Promise<void> & { returning?: () => Promise<unknown[]> } = Promise.resolve() as never
        ;(p as { returning: () => Promise<unknown[]> }).returning = async () => claimResult
        return { where: () => p }
      },
    }),
  },
  schema: {
    patient: { id: 'patient.id', organizationId: 'patient.org' },
    scheduledMessage: {
      id: 'sm.id', organizationId: 'sm.org', patientId: 'sm.patient', channel: 'sm.channel',
      body: 'sm.body', attachments: 'sm.att', scheduledFor: 'sm.when', status: 'sm.status',
      createdByUserId: 'sm.by', sentMessageId: 'sm.sent', lastError: 'sm.err', updatedAt: 'sm.upd',
    },
  },
}))

import {
  scheduleMessage,
  cancelScheduledMessage,
  sendDueScheduledMessages,
} from '@/lib/services/scheduled-messages'

beforeEach(() => {
  sendMessageToPatient.mockClear()
  selectResult = [{ id: 'pat_1' }] // patient exists by default
  claimResult = []
  inserted.length = 0
  updates.length = 0
})

const base = {
  organizationId: 'org_1',
  patientId: 'pat_1',
  channel: 'in_app' as const,
  body: 'See you Tuesday!',
  createdByUserId: 'u1',
}

describe('scheduleMessage — validation', () => {
  it('rejects an unsupported channel', async () => {
    await expect(scheduleMessage({ ...base, channel: 'sms' as never, scheduledFor: new Date(Date.now() + 3_600_000) })).rejects.toThrow(/in-app or email/i)
  })

  it('rejects an empty body with no attachments', async () => {
    await expect(scheduleMessage({ ...base, body: '   ', scheduledFor: new Date(Date.now() + 3_600_000) })).rejects.toThrow(/message or an attachment/i)
  })

  it('rejects a time in the past / under a minute out', async () => {
    await expect(scheduleMessage({ ...base, scheduledFor: new Date(Date.now() + 1_000) })).rejects.toThrow(/at least a minute/i)
  })

  it('rejects a time beyond the 60-day horizon', async () => {
    await expect(scheduleMessage({ ...base, scheduledFor: new Date(Date.now() + 61 * 24 * 3600_000) })).rejects.toThrow(/60 days/i)
  })

  it('rejects a patient that is not in the org', async () => {
    selectResult = [] // patient lookup returns nothing
    await expect(scheduleMessage({ ...base, scheduledFor: new Date(Date.now() + 3_600_000) })).rejects.toThrow(/not found/i)
  })

  it('inserts a pending row on the happy path', async () => {
    const when = new Date(Date.now() + 3 * 3600_000)
    const { id } = await scheduleMessage({ ...base, scheduledFor: when })
    expect(id).toMatch(/^smsg_/)
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ status: 'pending', channel: 'in_app', body: 'See you Tuesday!' })
  })

  it('allows a photo-only scheduled message', async () => {
    const when = new Date(Date.now() + 3 * 3600_000)
    await scheduleMessage({
      ...base,
      body: '',
      attachments: [{ url: 'https://cdn/x.jpg', name: 'x', contentType: 'image/jpeg' }],
      scheduledFor: when,
    })
    expect(inserted).toHaveLength(1)
  })
})

describe('cancelScheduledMessage', () => {
  it('issues a status update to canceled', async () => {
    await cancelScheduledMessage('org_1', 'smsg_1')
    expect(updates.some((u) => (u.set as { status?: string }).status === 'canceled')).toBe(true)
  })
})

describe('sendDueScheduledMessages — cron flush', () => {
  it('sends each claimed row and marks it sent', async () => {
    claimResult = [
      { id: 'smsg_1', organizationId: 'org_1', patientId: 'pat_1', channel: 'in_app', body: 'hi', attachments: [], createdByUserId: 'u1' },
      { id: 'smsg_2', organizationId: 'org_1', patientId: 'pat_2', channel: 'email', body: 'yo', attachments: [], createdByUserId: null },
    ]
    const res = await sendDueScheduledMessages()
    expect(res).toEqual({ due: 2, sent: 2, failed: 0 })
    expect(sendMessageToPatient).toHaveBeenCalledTimes(2)
    expect(updates.some((u) => (u.set as { status?: string }).status === 'sent')).toBe(true)
  })

  it('marks a row failed when its send throws, without blocking the others', async () => {
    claimResult = [
      { id: 'smsg_1', organizationId: 'org_1', patientId: 'pat_1', channel: 'email', body: 'hi', attachments: [], createdByUserId: 'u1' },
      { id: 'smsg_2', organizationId: 'org_1', patientId: 'pat_2', channel: 'in_app', body: 'yo', attachments: [], createdByUserId: 'u1' },
    ]
    sendMessageToPatient.mockRejectedValueOnce(new Error('no email on file'))
    const res = await sendDueScheduledMessages()
    expect(res).toEqual({ due: 2, sent: 1, failed: 1 })
    expect(updates.some((u) => (u.set as { status?: string; lastError?: string }).status === 'failed')).toBe(true)
  })

  it('is a no-op when nothing is due', async () => {
    claimResult = []
    const res = await sendDueScheduledMessages()
    expect(res).toEqual({ due: 0, sent: 0, failed: 0 })
    expect(sendMessageToPatient).not.toHaveBeenCalled()
  })
})
