import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE PERSON A THREAD WAS HANDED TO HEARS ABOUT IT (2026-10-26).
 *
 * `assignThread` was a bare UPDATE: "assign to Sam" changed a column and told
 * nobody, so the hand-off — the one moment everyone ELSE stops watching the
 * thread — was exactly when Sam didn't know. Now the assignee gets a
 * `thread_assigned` bell row (urgent, so it reaches their email under the
 * default mode) naming who handed it over and whose conversation it is.
 *
 * Silent on purpose: taking a thread yourself, unassigning, a thread that is
 * not this org's (the UPDATE matched nothing), and — before any of that — an
 * assignee who is not a member, which the existing guard refuses outright.
 * Best-effort: a notify failure never undoes or blocks the assignment.
 */

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<Record<string, unknown>>,
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
      update: () => ({
        set: (set: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(set)
          },
        }),
      }),
    },
    schema: {
      patient: { id: 'id', organizationId: 'org', firstName: 'firstName', lastName: 'lastName' },
      patientThread: { id: 'id', organizationId: 'org', patientId: 'patientId', assignedUserId: 'assignedUserId' },
      patientMessage: { id: 'id' },
      member: { userId: 'userId', organizationId: 'org' },
      user: { id: 'id', name: 'name', email: 'email' },
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

vi.mock('@/lib/email', () => ({ sendPatientMessageEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn(async () => ({})) }))

const { notifyMock, notifyOrgMembersMock } = vi.hoisted(() => ({
  notifyMock: vi.fn(async () => undefined),
  notifyOrgMembersMock: vi.fn(async () => undefined),
}))
vi.mock('@/lib/services/notifications', () => ({ notify: notifyMock, notifyOrgMembers: notifyOrgMembersMock }))

import { assignThread } from '@/lib/services/patient-messaging'

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  vi.clearAllMocks()
})

/** The reads in order: the membership guard, then (after the UPDATE) the
 *  thread row, the patient's first name and the actor's display name. */
function queueHandOff(opts: { member?: boolean; thread?: boolean; actor?: boolean } = {}) {
  state.selectQueue.push(opts.member === false ? [] : [{ id: 'u2' }]) // assertUserInOrg
  state.selectQueue.push(opts.thread === false ? [] : [{ patientId: 'pat_1' }]) // the thread (org-scoped)
  if (opts.thread !== false) {
    state.selectQueue.push([{ firstName: 'Sophia' }]) // the patient
    if (opts.actor !== false) state.selectQueue.push([{ name: 'Dr. Reyes' }]) // the actor
  }
}

describe('assignThread — the assignee hears about it', () => {
  it('tells the assignee who handed it over and whose conversation it is, with a door to the thread', async () => {
    queueHandOff()
    await assignThread('org_1', 'thr_1', 'u2', 'u1')
    expect(state.updates).toEqual([expect.objectContaining({ assignedUserId: 'u2' })])
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u2',
        organizationId: 'org_1',
        bucket: 'comments',
        type: 'thread_assigned',
        title: 'Dr. Reyes handed you Sophia’s conversation',
        linkPath: '/messages?thread=thr_1',
        meta: expect.objectContaining({ threadId: 'thr_1', patientId: 'pat_1', assignedByUserId: 'u1' }),
      }),
    )
    // The assignee is reached by id, never through the org fan-out.
    expect(notifyOrgMembersMock).not.toHaveBeenCalled()
  })

  it('names "A teammate" when the actor is unknown, rather than inventing one', async () => {
    queueHandOff({ actor: false })
    await assignThread('org_1', 'thr_1', 'u2')
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'A teammate handed you Sophia’s conversation' }),
    )
  })

  it('says nothing when you take the thread yourself', async () => {
    await assignThread('org_1', 'thr_1', 'u1', 'u1')
    expect(state.updates).toHaveLength(1)
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('says nothing on unassign', async () => {
    await assignThread('org_1', 'thr_1', null, 'u1')
    expect(state.updates).toEqual([expect.objectContaining({ assignedUserId: null })])
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('refuses a stranger as assignee BEFORE writing or telling anyone (the existing guard)', async () => {
    queueHandOff({ member: false })
    await expect(assignThread('org_1', 'thr_1', 'u_foreign', 'u1')).rejects.toThrow(/not a member/i)
    expect(state.updates).toHaveLength(0)
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('announces nothing for a thread that is not this org’s (the UPDATE matched no row)', async () => {
    queueHandOff({ thread: false })
    await assignThread('org_1', 'thr_other_org', 'u2', 'u1')
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('never lets a notify failure undo or block the assignment', async () => {
    queueHandOff()
    notifyMock.mockRejectedValueOnce(new Error('bell boom'))
    await expect(assignThread('org_1', 'thr_1', 'u2', 'u1')).resolves.toBeUndefined()
    expect(state.updates).toHaveLength(1)
  })
})
