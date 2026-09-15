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

const recordActionMock = vi.fn(async (..._a: unknown[]) => true)
vi.mock('@/lib/services/action-ledger', () => ({
  recordAction: (...a: unknown[]) => recordActionMock(...(a as [])),
}))

// A small controllable Drizzle stand-in. select→limit returns `selectResult`;
// insert captures values; update().set().where() captures; update().set()
// .where().returning() returns `claimResult`.
let selectResult: unknown[] = []
let selectThrows = false
let claimResult: unknown[] = []
/** Ordered script for `.returning()`, consumed one entry per call. Empty →
 *  every call falls back to `claimResult` (what the pre-DREAMCRM-57 tests
 *  expect). The flush now issues several: the batch claim, then one RE-CLAIM
 *  per row immediately before its send. */
let returningQueue: unknown[][] = []
let selectCalls = 0
const inserted: unknown[] = []
const updates: Array<{ set: unknown; where: unknown }> = []

vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      selectCalls++
      return {
        from: () => ({
          where: () => ({
            limit: async () => {
              if (selectThrows) throw new Error('transient DB blip')
              return selectResult
            },
            orderBy: async () => selectResult,
            // A bare `await db.select()…where()` with no limit/orderBy — the
            // shape the OLD select-then-update requeue used. Modelled so that
            // removing the fix makes the requeue tests fail on their
            // assertion rather than crash on a mock that cannot run it.
            then: (resolve: (v: unknown) => void) => resolve(selectResult),
          }),
        }),
      }
    },
    insert: () => ({ values: async (v: unknown) => { inserted.push(v) } }),
    update: () => ({
      set: (s: unknown) => ({
        // A plain thenable, not a native Promise: `await` on a native promise
        // never calls an overridden `.then`, so a plain `await …where()` would
        // land nowhere.
        where: (w: unknown) => {
          updates.push({ set: s, where: w })
          return {
            returning: async () => (returningQueue.length ? returningQueue.shift()! : claimResult),
            then: (resolve: (v: unknown) => void) => resolve(undefined),
          }
        },
      }),
    }),
  },
  schema: {
    patient: { id: 'patient.id', organizationId: 'patient.org', firstName: 'patient.first' },
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
  sendDueScheduledMessages,
  requeueStuckScheduledMessages,
} from '@/lib/services/scheduled-messages'

beforeEach(() => {
  sendMessageToPatient.mockClear()
  recordActionMock.mockClear()
  selectResult = [{ id: 'pat_1', firstName: 'Mia' }] // patient exists by default
  selectThrows = false
  claimResult = []
  returningQueue = []
  selectCalls = 0
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
    expect(res).toEqual({ due: 2, sent: 2, failed: 0, requeued: 0 })
    expect(sendMessageToPatient).toHaveBeenCalledTimes(2)
    expect(updates.some((u) => (u.set as { status?: string }).status === 'sent')).toBe(true)
    // The machine delivered staff-scheduled work — each delivery reports
    // (scheduled_message, executed writer pin, round-2 audit).
    expect(recordActionMock).toHaveBeenCalledTimes(2)
    const entries = recordActionMock.mock.calls.map((c) => c[0] as Record<string, unknown>)
    expect(entries.every((e) => e.capability === 'scheduled_message')).toBe(true)
    expect(entries.map((e) => e.patientId)).toEqual(['pat_1', 'pat_2'])
    expect(String(entries[0].summary)).toContain('Mia')
  })

  it('marks a row failed when its send throws, without blocking the others', async () => {
    claimResult = [
      { id: 'smsg_1', organizationId: 'org_1', patientId: 'pat_1', channel: 'email', body: 'hi', attachments: [], createdByUserId: 'u1' },
      { id: 'smsg_2', organizationId: 'org_1', patientId: 'pat_2', channel: 'in_app', body: 'yo', attachments: [], createdByUserId: 'u1' },
    ]
    sendMessageToPatient.mockRejectedValueOnce(new Error('no email on file'))
    const res = await sendDueScheduledMessages()
    expect(res).toEqual({ due: 2, sent: 1, failed: 1, requeued: 0 })
    expect(updates.some((u) => (u.set as { status?: string; lastError?: string }).status === 'failed')).toBe(true)
    // Only the delivery that HAPPENED is claimed in the ledger.
    expect(recordActionMock).toHaveBeenCalledTimes(1)
  })

  it('a ledger-lookup blip NEVER flips a delivered message to failed (round-3 regression pin)', async () => {
    claimResult = [
      { id: 'smsg_1', organizationId: 'org_1', patientId: 'pat_1', channel: 'in_app', body: 'hi', attachments: [], createdByUserId: 'u1' },
    ]
    selectThrows = true // the post-send name lookup rejects
    const res = await sendDueScheduledMessages()
    // The message was DELIVERED — the counters and the row must say so.
    expect(res).toEqual({ due: 1, sent: 1, failed: 0, requeued: 0 })
    expect(updates.some((u) => (u.set as { status?: string }).status === 'sent')).toBe(true)
    expect(updates.some((u) => (u.set as { status?: string }).status === 'failed')).toBe(false)
  })

  it('is a no-op when nothing is due', async () => {
    claimResult = []
    const res = await sendDueScheduledMessages()
    expect(res).toEqual({ due: 0, sent: 0, failed: 0, requeued: 0 })
    expect(sendMessageToPatient).not.toHaveBeenCalled()
  })
})

// ── DREAMCRM-57: the requeue double-send window ──────────────────────────────

describe('sendDueScheduledMessages — a row re-armed mid-flush is not sent twice', () => {
  const row = (id: string) => ({
    id,
    organizationId: 'org_1',
    patientId: 'pat_1',
    channel: 'in_app',
    body: 'hi',
    attachments: [],
    createdByUserId: 'u1',
  })

  it('skips a row the stuck-requeue re-armed while this run was still walking the batch', async () => {
    // The batch claim stamps every row's updatedAt at t=0 and the loop then
    // walks them one send at a time. A flush longer than STUCK_AFTER_MS meets
    // the next tick's requeue, which flips the not-yet-reached rows back to
    // 'pending'. Without the re-claim this run sent smsg_2 anyway and the next
    // tick sent it AGAIN — the patient got the same text twice.
    claimResult = [row('smsg_1'), row('smsg_2')]
    returningQueue = [
      [row('smsg_1'), row('smsg_2')], // the batch claim
      [{ id: 'smsg_1' }], // smsg_1 re-claim: still ours
      [], // smsg_2 re-claim: gone — something re-armed it
    ]

    const res = await sendDueScheduledMessages()

    expect(res.sent).toBe(1)
    expect(res.requeued).toBe(1)
    expect(sendMessageToPatient).toHaveBeenCalledTimes(1)
  })

  it('re-stamps updatedAt before each send, so a long flush stops looking stuck to itself', async () => {
    claimResult = [row('smsg_1')]
    returningQueue = [[row('smsg_1')], [{ id: 'smsg_1' }]]

    await sendDueScheduledMessages()

    // update #1 is the batch claim; #2 is this row's heartbeat — a bare
    // updatedAt touch, no status change.
    const heartbeat = updates[1].set as Record<string, unknown>
    expect(Object.keys(heartbeat)).toEqual(['updatedAt'])
    expect(heartbeat.updatedAt).toBeInstanceOf(Date)
  })

  it('CASes the terminal write on status=sending, so it cannot stomp a re-armed row', async () => {
    claimResult = [row('smsg_1')]
    returningQueue = [[row('smsg_1')], [{ id: 'smsg_1' }]]

    await sendDueScheduledMessages()

    const marked = updates.find(
      (u) => (u.set as Record<string, unknown>).status === 'sent',
    )
    expect(marked).toBeTruthy()
    // The predicate is an `and(...)`, not a bare id equality — the id alone
    // would let this run flip a row another run had already re-claimed.
    expect(JSON.stringify(marked!.where)).toContain('and')
    expect(JSON.stringify(marked!.where)).toContain('sending')
  })

  it('CASes the FAILED write too', async () => {
    claimResult = [row('smsg_1')]
    returningQueue = [[row('smsg_1')], [{ id: 'smsg_1' }]]
    sendMessageToPatient.mockRejectedValueOnce(new Error('send blew up') as never)

    await sendDueScheduledMessages()

    const marked = updates.find(
      (u) => (u.set as Record<string, unknown>).status === 'failed',
    )
    expect(marked).toBeTruthy()
    expect(JSON.stringify(marked!.where)).toContain('sending')
  })
})

describe('requeueStuckScheduledMessages — one statement, no TOCTOU', () => {
  it('re-arms without a preceding SELECT', async () => {
    returningQueue = [[{ id: 'smsg_1' }, { id: 'smsg_2' }]]

    const n = await requeueStuckScheduledMessages()

    expect(n).toBe(2)
    // The old shape SELECTed the stuck ids and then UPDATEd them by id with no
    // status re-check — a row that reached 'sent' in between was dragged back
    // to 'pending' and re-sent. The guard has to live in the same statement as
    // the write, so there is no select here at all.
    expect(selectCalls).toBe(0)
    expect(updates).toHaveLength(1)
  })

  it('carries the status guard in the WHERE of the write itself', async () => {
    returningQueue = [[{ id: 'smsg_1' }]]

    await requeueStuckScheduledMessages()

    const where = JSON.stringify(updates[0].where)
    expect(where).toContain('sending')
    expect(where).toContain('and')
    expect((updates[0].set as Record<string, unknown>).status).toBe('pending')
  })

  it('returns 0 when nothing is stuck', async () => {
    returningQueue = [[]]
    expect(await requeueStuckScheduledMessages()).toBe(0)
  })
})
