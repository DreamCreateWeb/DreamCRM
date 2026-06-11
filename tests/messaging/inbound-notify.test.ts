import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * recordInboundMessage (patient → clinic, e.g. a portal message) now pings org
 * owners/admins so an inbound doesn't wait for someone to refresh /messages.
 * Best-effort — the message row is the truth; a notify failure must not throw.
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
      patient: { id: 'id', organizationId: 'org', firstName: 'firstName', lastName: 'lastName' },
      patientThread: { id: 'id', organizationId: 'org', patientId: 'patientId', unreadCountForClinic: 'unread' },
      patientMessage: { id: 'id' },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  asc: vi.fn((x) => x),
  count: vi.fn(() => ({ _: 'count' })),
  desc: vi.fn((x) => x),
  eq: vi.fn(() => ({ _: 'eq' })),
  ilike: vi.fn(() => ({ _: 'ilike' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  lte: vi.fn(() => ({ _: 'lte' })),
  or: vi.fn(() => ({ _: 'or' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

// patient-messaging imports sendPatientMessageEmail + getClinicSenderIdentity at
// module load; stub them so the module imports cleanly (unused on inbound path).
vi.mock('@/lib/email', () => ({ sendPatientMessageEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn(async () => ({})) }))

const { notifyOrgMembersMock } = vi.hoisted(() => ({ notifyOrgMembersMock: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: notifyOrgMembersMock }))

import { recordInboundMessage } from '@/lib/services/patient-messaging'

beforeEach(() => {
  state.selectQueue = []
  vi.clearAllMocks()
})

/** assertPatientInOrg → patient row; getOrCreatePatientThread existing → thread
 *  row; then (post-write) the patient-name lookup for the notification title. */
function queueInbound(threadExists = true) {
  state.selectQueue.push([{ id: 'pat_1' }]) // assertPatientInOrg
  state.selectQueue.push(threadExists ? [{ id: 'thr_1' }] : []) // existing thread
  state.selectQueue.push([{ firstName: 'Sophia', lastName: 'Reyes' }]) // notify name lookup
}

describe('recordInboundMessage notifications', () => {
  it('pings owners/admins with the patient name → /messages?thread=', async () => {
    queueInbound(true)
    const { threadId } = await recordInboundMessage({
      organizationId: 'org_1',
      patientId: 'pat_1',
      body: 'Can I move my Tuesday cleaning?',
      channel: 'in_app',
    })
    expect(threadId).toBe('thr_1')
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({
        type: 'patient_message',
        title: expect.stringContaining('Sophia Reyes'),
        linkPath: '/messages?thread=thr_1',
      }),
      { roles: ['owner', 'admin'] },
    )
  })

  it('still records the message when the notify throws', async () => {
    notifyOrgMembersMock.mockRejectedValueOnce(new Error('notify boom'))
    queueInbound(true)
    const res = await recordInboundMessage({
      organizationId: 'org_1',
      patientId: 'pat_1',
      body: 'hello',
      channel: 'in_app',
    })
    expect(res.threadId).toBe('thr_1')
    expect(res.messageId).toBeTruthy()
  })
})
