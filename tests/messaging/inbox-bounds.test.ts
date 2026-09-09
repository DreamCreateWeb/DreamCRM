import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE INBOX READS ARE BOUNDED.
 *
 * `listPatientThreads` selected EVERY thread in the org — running a correlated
 * last-message subquery per row — and then narrowed by search in JavaScript.
 * `listMessagesInThread` selected every message plus every linked email. Both
 * were listed as perf cliffs in the DREAMCRM-2 audit (T1): fine at one beta
 * clinic, quadratic-feeling at a clinic two years in.
 *
 * Bounding them safely needed the search to move INTO SQL first — a LIMIT
 * ahead of a JavaScript filter would have searched only the first page and
 * reported "no matches" for a patient who was right there. These tests pin the
 * three things that make the bound honest:
 *
 *   1. the query asks the database for a bounded page (a `.limit()` call);
 *   2. `hasMore` / `hasOlder` are FACTS — the reads take one row over the cap
 *      rather than guessing from an exact-length match;
 *   3. a capped message stream keeps the NEWEST messages, in chronological
 *      order — truncating the recent end of a conversation would be worse than
 *      not truncating at all.
 */

const queue: unknown[][] = []
const limits: number[] = []

function chain(): any {
  const node: any = {}
  const rows = () => queue.shift() ?? []
  for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'groupBy']) {
    node[m] = () => node
  }
  node.limit = (n: number) => {
    limits.push(n)
    return Promise.resolve(rows())
  }
  node.then = (res: (v: unknown[]) => unknown) => Promise.resolve(rows()).then(res)
  return node
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  return { db: { select: () => chain() }, schema }
})

vi.mock('@/lib/services/action-ledger', () => ({ recordAction: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendPatientMessageEmail: vi.fn() }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn() }))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'America/New_York') }))

function threadRow(id: string) {
  return {
    id,
    patientId: 'pat_' + id,
    patientFirstName: 'Pat',
    patientLastName: id.toUpperCase(),
    patientEmail: null,
    patientPhone: null,
    status: 'open',
    assignedUserId: null,
    assignedUserName: null,
    snoozedUntil: null,
    lastMessageAt: new Date('2026-09-01T10:00:00Z'),
    lastMessageDirection: 'inbound',
    lastMessageChannel: 'in_app',
    unreadCount: 0,
    starred: false,
    urgency: null,
    urgencyReason: null,
    createdAt: new Date('2026-08-01T10:00:00Z'),
    lastMessagePreview: 'hello',
  }
}

function patientMessage(iso: string, id: string) {
  return {
    id,
    channel: 'in_app',
    direction: 'inbound',
    body: id,
    sentByUserId: null,
    sentByName: null,
    sentAt: new Date(iso),
    deliveredAt: null,
    readByPatientAt: null,
    externalId: null,
    meta: null,
  }
}

beforeEach(() => {
  queue.length = 0
  limits.length = 0
})

describe('listPatientThreadsPage', () => {
  it('asks the database for a bounded page, one row over the cap', async () => {
    const { listPatientThreadsPage } = await import('@/lib/services/patient-messaging')
    queue.push([threadRow('t1')])

    await listPatientThreadsPage('org_1', 'user_1', {}, 50)
    expect(limits).toEqual([51])
  })

  it('reports hasMore only when a row beyond the cap actually came back', async () => {
    const { listPatientThreadsPage } = await import('@/lib/services/patient-messaging')

    // Exactly the cap — nothing older, so no note should be shown.
    queue.push([threadRow('a'), threadRow('b')])
    const exact = await listPatientThreadsPage('org_1', 'user_1', {}, 2)
    expect(exact.threads).toHaveLength(2)
    expect(exact.hasMore).toBe(false)

    // One over — there IS more, and the extra row is not handed to the UI.
    queue.push([threadRow('a'), threadRow('b'), threadRow('c')])
    const over = await listPatientThreadsPage('org_1', 'user_1', {}, 2)
    expect(over.threads.map((t) => t.id)).toEqual(['a', 'b'])
    expect(over.hasMore).toBe(true)
  })

  it('still returns a plain array from the compatibility wrapper', async () => {
    const { listPatientThreads } = await import('@/lib/services/patient-messaging')
    queue.push([threadRow('a')])
    const rows = await listPatientThreads('org_1', 'user_1', {})
    expect(Array.isArray(rows)).toBe(true)
    expect(rows[0].id).toBe('a')
  })
})

describe('search text as a LIKE pattern', () => {
  it('escapes the wildcards that String.includes treated as ordinary text', async () => {
    const { likePattern } = await import('@/lib/services/patient-messaging')
    // A patient literally named "A_B" must not match every two-letter name.
    expect(likePattern('a_b')).toBe('%a\\_b%')
    expect(likePattern('50%')).toBe('%50\\%%')
    expect(likePattern('back\\slash')).toBe('%back\\\\slash%')
    // Ordinary text is untouched.
    expect(likePattern('smith')).toBe('%smith%')
  })
})

describe('listThreadMessagePage', () => {
  it('bounds BOTH sources — patient messages and linked emails', async () => {
    const { listThreadMessagePage } = await import('@/lib/services/patient-messaging')
    queue.push([threadRow('t1')]) // getPatientThreadById
    queue.push([patientMessage('2026-09-01T10:00:00Z', 'm1')])
    queue.push([])

    await listThreadMessagePage('org_1', 't1', 25)
    // [1] is getPatientThreadById's own single-row lookup; the two 26s are the
    // capped message + linked-email reads.
    expect(limits).toEqual([1, 26, 26])
  })

  it('keeps the NEWEST messages, oldest-first, and reports the rest as older', async () => {
    const { listThreadMessagePage } = await import('@/lib/services/patient-messaging')
    queue.push([threadRow('t1')])
    // The query orders newest-first; four rows for a cap of three.
    queue.push([
      patientMessage('2026-09-04T10:00:00Z', 'newest'),
      patientMessage('2026-09-03T10:00:00Z', 'third'),
      patientMessage('2026-09-02T10:00:00Z', 'second'),
      patientMessage('2026-09-01T10:00:00Z', 'oldest'),
    ])
    queue.push([])

    const page = await listThreadMessagePage('org_1', 't1', 3)
    expect(page.messages.map((m) => m.id)).toEqual(['second', 'third', 'newest'])
    expect(page.hasOlder).toBe(true)
  })

  it('does not claim older messages exist when the thread fits', async () => {
    const { listThreadMessagePage } = await import('@/lib/services/patient-messaging')
    queue.push([threadRow('t1')])
    queue.push([patientMessage('2026-09-02T10:00:00Z', 'b'), patientMessage('2026-09-01T10:00:00Z', 'a')])
    queue.push([])

    const page = await listThreadMessagePage('org_1', 't1', 10)
    expect(page.messages.map((m) => m.id)).toEqual(['a', 'b'])
    expect(page.hasOlder).toBe(false)
  })

  it('returns an empty page for a thread outside the org rather than throwing', async () => {
    const { listThreadMessagePage } = await import('@/lib/services/patient-messaging')
    queue.push([]) // getPatientThreadById finds nothing
    const page = await listThreadMessagePage('org_other', 't1')
    expect(page).toEqual({ messages: [], hasOlder: false })
  })
})
