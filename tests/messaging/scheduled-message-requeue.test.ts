import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * requeueStuckScheduledMessages re-arms rows abandoned in 'sending' (the
 * process died mid-flush) so the next tick retries them.
 *
 * THE DEFECT IT GUARDS: it used to SELECT the stuck ids and then UPDATE by id
 * with nothing in the WHERE but `id in (…)`. Between those two statements the
 * flush that owned the row could finish — mark it 'sent', or mark it 'failed'
 * — and the blind update flipped it straight back to 'pending'. The next
 * flush then claimed it and sent the patient the same message a second time.
 * That is the whole reason this function's threshold exists: the row it is
 * most likely to race is the one that has been sending for almost exactly
 * `olderThanMs`.
 *
 * The rows below are a tiny in-memory table so the predicate is evaluated
 * against the state of the row AT WRITE TIME, which is the property under
 * test — not against the ids some earlier statement remembered.
 */

type Row = { id: string; status: string; updatedAt: Date }

const table: Row[] = []
/** Fires immediately before an UPDATE's predicate is evaluated — the stand-in
 *  for another transaction committing while this one is in flight. */
let onWrite: (() => void) | null = null
let scanned = 0

const FIELD: Record<string, keyof Row> = {
  'sm.id': 'id',
  'sm.status': 'status',
  'sm.upd': 'updatedAt',
}

type Pred =
  | { op: 'and'; parts: Pred[] }
  | { op: 'eq'; col: string; val: unknown }
  | { op: 'lte'; col: string; val: Date }
  | { op: 'in'; col: string; vals: unknown[] }

function matches(row: Row, p: Pred | undefined): boolean {
  if (!p) return true
  switch (p.op) {
    case 'and':
      return p.parts.every((part) => matches(row, part))
    case 'eq':
      return row[FIELD[p.col]] === p.val
    case 'lte':
      return (row[FIELD[p.col]] as Date).getTime() <= p.val.getTime()
    case 'in':
      return p.vals.includes(row[FIELD[p.col]])
  }
}

vi.mock('drizzle-orm', () => ({
  and: (...parts: unknown[]) => ({ op: 'and', parts: parts.filter(Boolean) }),
  eq: (col: string, val: unknown) => ({ op: 'eq', col, val }),
  lte: (col: string, val: unknown) => ({ op: 'lte', col, val }),
  inArray: (col: string, vals: unknown[]) => ({ op: 'in', col, vals }),
  notInArray: (col: string, vals: unknown[]) => ({ op: 'notIn', col, vals }),
  asc: (c: unknown) => c,
}))

vi.mock('./billing-state', () => ({ listShutDownOrgIds: async () => new Set<string>() }))
vi.mock('@/lib/services/billing-state', () => ({ listShutDownOrgIds: async () => new Set<string>() }))
vi.mock('@/lib/services/patient-messaging', () => ({ sendMessageToPatient: vi.fn() }))
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: vi.fn(async () => true) }))

vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      const c: any = {
        from: () => c,
        where: (w: Pred) => {
          c._w = w
          return c
        },
        orderBy: () => c,
        limit: () => c,
        then: (res: (v: unknown[]) => unknown) => {
          const rows = table.filter((r) => matches(r, c._w)).map((r) => ({ ...r }))
          scanned = rows.length
          return Promise.resolve(rows).then(res)
        },
      }
      return c
    },
    insert: () => ({ values: async () => undefined }),
    update: () => ({
      set: (patch: Partial<Row>) => ({
        where: (w: Pred) => {
          const run = () => {
            onWrite?.()
            const hit = table.filter((r) => matches(r, w))
            for (const r of hit) Object.assign(r, patch)
            return hit.map((r) => ({ id: r.id }))
          }
          const res: any = {
            returning: async () => run(),
            then: (resolve: (v: unknown) => void) => resolve(run()),
          }
          return res
        },
      }),
    }),
  },
  schema: {
    patient: { id: 'patient.id', organizationId: 'patient.org' },
    user: { id: 'user.id', name: 'user.name' },
    scheduledMessage: {
      id: 'sm.id',
      organizationId: 'sm.org',
      patientId: 'sm.patient',
      channel: 'sm.channel',
      body: 'sm.body',
      attachments: 'sm.att',
      scheduledFor: 'sm.when',
      status: 'sm.status',
      createdByUserId: 'sm.by',
      sentMessageId: 'sm.sent',
      lastError: 'sm.err',
      updatedAt: 'sm.upd',
    },
  },
}))

import { requeueStuckScheduledMessages } from '@/lib/services/scheduled-messages'

const NOW = Date.now()
const minutesAgo = (n: number) => new Date(NOW - n * 60 * 1000)

beforeEach(() => {
  table.length = 0
  onWrite = null
  scanned = 0
})

describe('requeueStuckScheduledMessages', () => {
  it('re-arms a row abandoned in sending past the threshold', async () => {
    table.push({ id: 'smsg_1', status: 'sending', updatedAt: minutesAgo(30) })
    const n = await requeueStuckScheduledMessages()
    expect(n).toBe(1)
    expect(table[0].status).toBe('pending')
  })

  it('leaves a row whose flush marked it sent while this requeue was in flight', async () => {
    table.push({ id: 'smsg_1', status: 'sending', updatedAt: minutesAgo(30) })
    // The owning flush commits its 'sent' write just before ours lands. A
    // requeue that acts on what it read earlier re-arms a DELIVERED message
    // and the next flush texts the patient twice.
    onWrite = () => {
      table[0].status = 'sent'
    }
    const n = await requeueStuckScheduledMessages()
    expect(table[0].status).toBe('sent')
    expect(n).toBe(0)
  })

  it('leaves a row whose flush marked it failed while this requeue was in flight', async () => {
    table.push({ id: 'smsg_1', status: 'sending', updatedAt: minutesAgo(30) })
    onWrite = () => {
      table[0].status = 'failed'
    }
    const n = await requeueStuckScheduledMessages()
    expect(table[0].status).toBe('failed')
    expect(n).toBe(0)
  })

  it('leaves a row that is still inside the stuck threshold', async () => {
    table.push({ id: 'smsg_1', status: 'sending', updatedAt: minutesAgo(2) })
    const n = await requeueStuckScheduledMessages()
    expect(n).toBe(0)
    expect(table[0].status).toBe('sending')
  })

  it('touches only the sending rows, never a pending or sent one', async () => {
    table.push({ id: 'smsg_1', status: 'sending', updatedAt: minutesAgo(30) })
    table.push({ id: 'smsg_2', status: 'pending', updatedAt: minutesAgo(30) })
    table.push({ id: 'smsg_3', status: 'sent', updatedAt: minutesAgo(30) })
    const n = await requeueStuckScheduledMessages()
    expect(n).toBe(1)
    expect(table.map((r) => r.status)).toEqual(['pending', 'pending', 'sent'])
  })

  it('returns zero without writing when nothing is stuck', async () => {
    const n = await requeueStuckScheduledMessages()
    expect(n).toBe(0)
  })
})
