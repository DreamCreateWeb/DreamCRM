import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Scheduled (send-later) patient messages. Covers the validation gate
 * (channel / body-or-attachment / time window / cross-tenant), and the cron
 * flush (atomic claim → send each → mark sent, with a failure marking just
 * that row 'failed' and never blocking the rest).
 *
 * A FAILED send is no longer silent (2026-10-26): the flush tells the person
 * who scheduled it (else the owners/admins) with an urgent bell + email, files
 * a failure in the clinic's own ledger, the composer still LISTS the row (in
 * rose, with the reason), and a human can retry or dismiss it. The strip
 * vanishing used to be indistinguishable from a successful send.
 */

const sendMessageToPatient = vi.fn(async () => ({ threadId: 'thr_1', messageId: 'pmsg_new' }))
vi.mock('@/lib/services/patient-messaging', () => ({
  sendMessageToPatient: (...a: unknown[]) => sendMessageToPatient(...(a as [])),
}))

const recordActionMock = vi.fn(async (..._a: unknown[]) => true)
const recordEngineFailureMock = vi.fn(async (..._a: unknown[]) => true)
vi.mock('@/lib/services/action-ledger', () => ({
  recordAction: (...a: unknown[]) => recordActionMock(...(a as [])),
  recordEngineFailure: (...a: unknown[]) => recordEngineFailureMock(...(a as [])),
}))

const notifyMock = vi.fn(async (..._a: unknown[]) => undefined)
const notifyOrgMembersMock = vi.fn(async (..._a: unknown[]) => undefined)
vi.mock('@/lib/services/notifications', () => ({
  notify: (...a: unknown[]) => notifyMock(...(a as [])),
  notifyOrgMembers: (...a: unknown[]) => notifyOrgMembersMock(...(a as [])),
}))

vi.mock('@/lib/services/billing-state', () => ({
  listShutDownOrgIds: async () => new Set<string>(),
}))

// A small controllable Drizzle stand-in. select→limit returns the next queued
// result (else `selectResult`); insert captures values; update().set().where()
// captures; update().set().where().returning() returns `claimResult`.
let selectResult: unknown[] = []
let selectQueue: unknown[][] = []
let selectThrows = false
let claimResult: unknown[] = []
const inserted: unknown[] = []
const updates: Array<{ set: unknown }> = []

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (selectThrows) throw new Error('transient DB blip')
            return selectQueue.length > 0 ? selectQueue.shift() : selectResult
          },
          orderBy: async () => selectResult,
        }),
      }),
    }),
    insert: () => ({ values: async (v: unknown) => { inserted.push(v) } }),
    update: () => ({
      set: (s: unknown) => {
        updates.push({ set: s })
        // The same value supports both `await …where()` (cancel / mark) and
        // `await …where().returning()` (the atomic claim + the retry).
        const p: Promise<void> & { returning?: () => Promise<unknown[]> } = Promise.resolve() as never
        ;(p as { returning: () => Promise<unknown[]> }).returning = async () => claimResult
        return { where: () => p }
      },
    }),
  },
  schema: {
    patient: { id: 'patient.id', organizationId: 'patient.org', firstName: 'patient.first' },
    patientThread: { id: 'thread.id', organizationId: 'thread.org', patientId: 'thread.patient' },
    member: { userId: 'member.user', organizationId: 'member.org' },
    user: { id: 'user.id', name: 'user.name' },
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
  retryScheduledMessage,
  listScheduledForPatient,
  sendDueScheduledMessages,
  scheduledFailureBody,
} from '@/lib/services/scheduled-messages'

beforeEach(() => {
  sendMessageToPatient.mockClear()
  recordActionMock.mockClear()
  recordEngineFailureMock.mockClear()
  notifyMock.mockClear()
  notifyOrgMembersMock.mockClear()
  selectResult = [{ id: 'pat_1', firstName: 'Mia', userId: 'u1' }] // patient / thread / member all "exist" by default
  selectQueue = []
  selectThrows = false
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
      attachments: [{ url: 'https://dreamcrm-uploads-test.s3.us-east-1.amazonaws.com/x.jpg', name: 'x', contentType: 'image/jpeg' }],
      scheduledFor: when,
    })
    expect(inserted).toHaveLength(1)
  })
})

describe('listScheduledForPatient — pending AND failed rows', () => {
  it('maps a failed row with its reason beside the pending ones', async () => {
    selectResult = [
      { id: 'smsg_1', channel: 'email', body: 'hi', attachments: [], scheduledFor: new Date('2026-10-27T13:00:00Z'), status: 'pending', lastError: null },
      { id: 'smsg_2', channel: 'in_app', body: 'yo', attachments: [], scheduledFor: new Date('2026-10-26T09:00:00Z'), status: 'failed', lastError: 'Patient has no email on file' },
    ]
    const rows = await listScheduledForPatient('org_1', 'pat_1')
    expect(rows.map((r) => r.status)).toEqual(['pending', 'failed'])
    expect(rows[1]).toMatchObject({ id: 'smsg_2', lastError: 'Patient has no email on file' })
    // A pending row never carries a stale reason.
    expect(rows[0].lastError).toBeNull()
  })
})

describe('cancelScheduledMessage', () => {
  it('issues a status update to canceled', async () => {
    await cancelScheduledMessage('org_1', 'smsg_1')
    expect(updates.some((u) => (u.set as { status?: string }).status === 'canceled')).toBe(true)
  })
})

describe('retryScheduledMessage — a human puts a failed send back in the queue', () => {
  it('re-queues as pending, due now, with the error cleared — and reports the match', async () => {
    claimResult = [{ id: 'smsg_2' }]
    const now = new Date('2026-10-26T15:00:00Z')
    expect(await retryScheduledMessage('org_1', 'smsg_2', now)).toBe(true)
    const set = updates[0].set as { status: string; scheduledFor: Date; lastError: unknown }
    expect(set.status).toBe('pending')
    expect(set.scheduledFor).toEqual(now)
    expect(set.lastError).toBeNull()
    // The flush is what sends it — never this call. A retry is a re-queue
    // through the normal path (validation + atomic claim intact).
    expect(sendMessageToPatient).not.toHaveBeenCalled()
  })

  it('reports false when nothing matched (already sent / canceled / foreign)', async () => {
    claimResult = []
    expect(await retryScheduledMessage('org_1', 'smsg_gone')).toBe(false)
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
    // The machine delivered staff-scheduled work — each delivery reports
    // (scheduled_message, executed writer pin, round-2 audit).
    expect(recordActionMock).toHaveBeenCalledTimes(2)
    const entries = recordActionMock.mock.calls.map((c) => c[0] as Record<string, unknown>)
    expect(entries.every((e) => e.capability === 'scheduled_message')).toBe(true)
    expect(entries.map((e) => e.patientId)).toEqual(['pat_1', 'pat_2'])
    expect(String(entries[0].summary)).toContain('Mia')
    // Nothing failed → nobody is alarmed.
    expect(notifyMock).not.toHaveBeenCalled()
    expect(notifyOrgMembersMock).not.toHaveBeenCalled()
    expect(recordEngineFailureMock).not.toHaveBeenCalled()
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
    // Only the delivery that HAPPENED is claimed in the ledger.
    expect(recordActionMock).toHaveBeenCalledTimes(1)
  })

  it('a failed send TELLS the scheduler (urgent bell) and files a ledger failure', async () => {
    claimResult = [
      { id: 'smsg_1', organizationId: 'org_1', patientId: 'pat_1', channel: 'email', body: 'see you at 10', attachments: [], createdByUserId: 'u1' },
    ]
    // patient → thread → member lookups, in the order the alert makes them.
    selectQueue = [[{ firstName: 'Mia' }], [{ id: 'thr_9' }], [{ userId: 'u1' }]]
    sendMessageToPatient.mockRejectedValueOnce(new Error('Patient has no email on file'))
    await sendDueScheduledMessages()

    expect(notifyMock).toHaveBeenCalledTimes(1)
    const alert = notifyMock.mock.calls[0][0] as Record<string, unknown>
    expect(alert).toMatchObject({
      userId: 'u1',
      organizationId: 'org_1',
      type: 'scheduled_message_failed',
      title: 'The message you scheduled for Mia didn’t send',
      linkPath: '/messages?thread=thr_9',
      dedupeKey: 'scheduled_message_failed:org_1:smsg_1',
    })
    expect(String(alert.body)).toContain('Patient has no email on file.')
    expect(String(alert.body)).toMatch(/retry or dismiss/)
    expect(notifyOrgMembersMock).not.toHaveBeenCalled()

    expect(recordEngineFailureMock).toHaveBeenCalledTimes(1)
    const failure = recordEngineFailureMock.mock.calls[0][0] as Record<string, unknown>
    expect(failure).toMatchObject({ organizationId: 'org_1', capability: 'scheduled_message', patientId: 'pat_1', kind: 'engine' })
    expect(Number(failure.onceWithin)).toBeGreaterThan(0)
    expect(String(failure.summary)).toMatch(/^Couldn’t send/)
  })

  it('falls back to the owners/admins when the scheduler is gone (or unknown)', async () => {
    claimResult = [
      { id: 'smsg_1', organizationId: 'org_1', patientId: 'pat_1', channel: 'email', body: 'hi', attachments: [], createdByUserId: 'u_left' },
    ]
    selectQueue = [[{ firstName: 'Mia' }], [{ id: 'thr_9' }], []] // no longer a member
    sendMessageToPatient.mockRejectedValueOnce(new Error('provider outage'))
    await sendDueScheduledMessages()
    expect(notifyMock).not.toHaveBeenCalled()
    expect(notifyOrgMembersMock).toHaveBeenCalledTimes(1)
    const [orgId, alert, opts] = notifyOrgMembersMock.mock.calls[0] as [string, Record<string, unknown>, Record<string, unknown>]
    expect(orgId).toBe('org_1')
    expect(alert.type).toBe('scheduled_message_failed')
    expect(opts).toEqual({ roles: ['owner', 'admin'] })
  })

  it('an alert blip never un-fails the row or stops the loop', async () => {
    claimResult = [
      { id: 'smsg_1', organizationId: 'org_1', patientId: 'pat_1', channel: 'email', body: 'hi', attachments: [], createdByUserId: 'u1' },
      { id: 'smsg_2', organizationId: 'org_1', patientId: 'pat_2', channel: 'in_app', body: 'yo', attachments: [], createdByUserId: 'u1' },
    ]
    sendMessageToPatient.mockRejectedValueOnce(new Error('no email on file'))
    notifyMock.mockRejectedValueOnce(new Error('bell is down'))
    const res = await sendDueScheduledMessages()
    expect(res).toEqual({ due: 2, sent: 1, failed: 1 })
    expect(updates.some((u) => (u.set as { status?: string }).status === 'failed')).toBe(true)
    expect(sendMessageToPatient).toHaveBeenCalledTimes(2)
  })

  it('a ledger-lookup blip NEVER flips a delivered message to failed (round-3 regression pin)', async () => {
    claimResult = [
      { id: 'smsg_1', organizationId: 'org_1', patientId: 'pat_1', channel: 'in_app', body: 'hi', attachments: [], createdByUserId: 'u1' },
    ]
    selectThrows = true // the post-send name lookup rejects
    const res = await sendDueScheduledMessages()
    // The message was DELIVERED — the counters and the row must say so.
    expect(res).toEqual({ due: 1, sent: 1, failed: 0 })
    expect(updates.some((u) => (u.set as { status?: string }).status === 'sent')).toBe(true)
    expect(updates.some((u) => (u.set as { status?: string }).status === 'failed')).toBe(false)
  })

  it('is a no-op when nothing is due', async () => {
    claimResult = []
    const res = await sendDueScheduledMessages()
    expect(res).toEqual({ due: 0, sent: 0, failed: 0 })
    expect(sendMessageToPatient).not.toHaveBeenCalled()
  })
})

describe('scheduledFailureBody', () => {
  it('ends the reason with a period and says where to go', () => {
    expect(scheduledFailureBody('Patient has no email on file')).toBe(
      'Patient has no email on file. It’s waiting in the conversation — open it to retry or dismiss.',
    )
    expect(scheduledFailureBody(null)).toMatch(/^Something went wrong on our side\./)
  })
})
