import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * recordInboundMessage (patient → clinic, e.g. a portal message) pings the
 * staff so an inbound doesn't wait for someone to refresh /messages.
 * Best-effort — the message row is the truth; a notify failure must not throw.
 *
 * Three rules landed 2026-10-26, all in the same block:
 *  - EVERYONE AT THE DESK HEARS — owners, admins AND members. The fan-out was
 *    owner/admin-only while the team panel invites at 'member' by default, so
 *    the front desk never heard the patient-message bell. (A deliberate
 *    exception to the owner/admin convention; the bounce alert in the same
 *    file already made it.)
 *  - THE ASSIGNEE HEARS DIRECTLY, by id, with the same alert — and only once,
 *    because the direct dispatch and the fan-out share a dedupeKey.
 *  - ONE ALERT PER UNREAD THREAD, NOT PER MESSAGE: `patient_message` is
 *    urgent, so three texts in a row were three emails to every owner. When
 *    the thread was already unread nothing is dispatched; the realtime push
 *    and the urgency triage still fire; reading the thread resets it.
 */

const state = {
  selectQueue: [] as unknown[][],
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({ values: async () => undefined }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    },
    schema: {
      patient: { id: 'id', organizationId: 'org', firstName: 'firstName', lastName: 'lastName', email: 'email' },
      patientThread: {
        id: 'id',
        organizationId: 'org',
        patientId: 'patientId',
        unreadCountForClinic: 'unread',
        assignedUserId: 'assignedUserId',
      },
      patientMessage: { id: 'id' },
      user: { id: 'id', email: 'email', name: 'name' },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  asc: vi.fn((x) => x),
  count: vi.fn(() => ({ _: 'count' })),
  desc: vi.fn((x) => x),
  eq: vi.fn(() => ({ _: 'eq' })),
  gte: vi.fn(() => ({ _: 'gte' })),
  ilike: vi.fn(() => ({ _: 'ilike' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  lte: vi.fn(() => ({ _: 'lte' })),
  notInArray: vi.fn(() => ({ _: 'notInArray' })),
  or: vi.fn(() => ({ _: 'or' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

// patient-messaging imports sendPatientMessageEmail + getClinicSenderIdentity at
// module load; stub them so the module imports cleanly (unused on inbound path).
vi.mock('@/lib/email', () => ({ sendPatientMessageEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn(async () => ({})) }))

const { notifyMock, notifyOrgMembersMock, publishRealtimeMock, triageMock } = vi.hoisted(() => ({
  notifyMock: vi.fn(async () => undefined),
  notifyOrgMembersMock: vi.fn(async () => undefined),
  publishRealtimeMock: vi.fn(async () => undefined),
  triageMock: vi.fn(async () => undefined),
}))
vi.mock('@/lib/services/notifications', () => ({ notify: notifyMock, notifyOrgMembers: notifyOrgMembersMock }))
vi.mock('@/lib/services/realtime', () => ({ publishRealtime: publishRealtimeMock }))
vi.mock('@/lib/services/thread-triage', () => ({ classifyInboundUrgency: triageMock }))

import { recordInboundMessage } from '@/lib/services/patient-messaging'

beforeEach(() => {
  state.selectQueue = []
  vi.clearAllMocks()
})

/** The reads in order: assertPatientInOrg → the existing thread → the thread's
 *  state BEFORE the write (unread count + assignee) → the patient-name lookup
 *  for the title → (only when assigned) the assignee's login email. */
function queueInbound(opts: { unreadBefore?: number; assignedUserId?: string | null; assigneeEmail?: string } = {}) {
  state.selectQueue.push([{ id: 'pat_1' }]) // assertPatientInOrg
  state.selectQueue.push([{ id: 'thr_1' }]) // existing thread
  state.selectQueue.push([{ unreadCountForClinic: opts.unreadBefore ?? 0, assignedUserId: opts.assignedUserId ?? null }])
  if ((opts.unreadBefore ?? 0) === 0) {
    state.selectQueue.push([{ firstName: 'Sophia', lastName: 'Reyes', email: 'sophia@example.com' }]) // notify name lookup
    if (opts.assignedUserId) state.selectQueue.push([{ email: opts.assigneeEmail ?? 'sam@clinic.example' }])
  }
}

const inbound = { organizationId: 'org_1', patientId: 'pat_1', body: 'Can I move my Tuesday cleaning?', channel: 'in_app' as const }

/** The fire-and-forget triage rides a dynamic import; let it settle. */
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('recordInboundMessage notifications', () => {
  it('pings owners, admins AND members with the patient name → /messages?thread=', async () => {
    queueInbound()
    const { threadId } = await recordInboundMessage(inbound)
    expect(threadId).toBe('thr_1')
    expect(notifyOrgMembersMock).toHaveBeenCalledTimes(1)
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({
        type: 'patient_message',
        title: expect.stringContaining('Sophia Reyes'),
        linkPath: '/messages?thread=thr_1',
        dedupeKey: expect.stringMatching(/^patient_message:org_1:/),
      }),
      // 'member' is the deliberate exception to the owner/admin convention —
      // the front desk answers these. Sophia's own email is excluded: a
      // staff-hat user who IS the patient must never get the staff alert
      // about their own message (the demo bug).
      { roles: ['owner', 'admin', 'member'], excludeEmail: 'sophia@example.com' },
    )
    // Nobody is assigned, so nobody is reached directly.
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('reaches the assignee directly, by id, with the SAME alert and the same dedupeKey (one row, not two)', async () => {
    queueInbound({ assignedUserId: 'u_sam' })
    await recordInboundMessage(inbound)
    expect(notifyMock).toHaveBeenCalledTimes(1)
    const direct = (notifyMock.mock.calls as unknown[][])[0][0] as Record<string, unknown>
    const fanOut = (notifyOrgMembersMock.mock.calls as unknown[][])[0][1] as Record<string, unknown>
    expect(direct).toEqual(
      expect.objectContaining({
        userId: 'u_sam',
        organizationId: 'org_1',
        type: 'patient_message',
        title: 'New message from Sophia Reyes',
        linkPath: '/messages?thread=thr_1',
      }),
    )
    expect(direct.dedupeKey).toBe(fanOut.dedupeKey)
    expect(typeof direct.dedupeKey).toBe('string')
  })

  it('skips the direct alert when the assignee’s login IS the patient’s email (the self-exclusion, both paths)', async () => {
    queueInbound({ assignedUserId: 'u_owner', assigneeEmail: 'Sophia@Example.com' })
    await recordInboundMessage(inbound)
    expect(notifyMock).not.toHaveBeenCalled()
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.anything(),
      expect.objectContaining({ excludeEmail: 'sophia@example.com' }),
    )
  })

  it('a second message on an ALREADY-UNREAD thread dispatches no alert — the tray holds the first one', async () => {
    queueInbound({ unreadBefore: 2, assignedUserId: 'u_sam' })
    const res = await recordInboundMessage({ ...inbound, body: 'or Wednesday?' })
    expect(res.threadId).toBe('thr_1')
    expect(notifyOrgMembersMock).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
    // The live view and the urgency triage still fire — only the BELL is held.
    expect(publishRealtimeMock).toHaveBeenCalledWith('org_1', 'messages', expect.objectContaining({ threadId: 'thr_1', direction: 'inbound' }))
    await tick()
    expect(triageMock).toHaveBeenCalledWith('org_1', 'thr_1', 'or Wednesday?')
  })

  it('once the thread has been read (unread back to 0) the next message alerts again', async () => {
    queueInbound({ unreadBefore: 0 })
    await recordInboundMessage(inbound)
    expect(notifyOrgMembersMock).toHaveBeenCalledTimes(1)
  })

  it('a missing thread-state row fails toward the alert, never toward silence', async () => {
    state.selectQueue.push([{ id: 'pat_1' }])
    state.selectQueue.push([{ id: 'thr_1' }])
    state.selectQueue.push([]) // no state row came back
    state.selectQueue.push([{ firstName: 'Sophia', lastName: 'Reyes', email: null }])
    await recordInboundMessage(inbound)
    expect(notifyOrgMembersMock).toHaveBeenCalledTimes(1)
  })

  it('still records the message when the notify throws', async () => {
    notifyOrgMembersMock.mockRejectedValueOnce(new Error('notify boom'))
    queueInbound()
    const res = await recordInboundMessage({ ...inbound, body: 'hello' })
    expect(res.threadId).toBe('thr_1')
    expect(res.messageId).toBeTruthy()
  })
})
