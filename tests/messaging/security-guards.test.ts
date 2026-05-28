import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Security + correctness sweep on the patient-messaging service write
 * paths. Covers the cross-tenant + body-shape guards added during the
 * messages-module review:
 *
 *   • sendMessageToPatient / recordInboundMessage reject patientIds
 *     that don't belong to the org (cross-tenant data leak prevention)
 *   • assignThread rejects an assigneeUserId that isn't a member of
 *     the org (would leak that user's name into the inbox JOIN)
 *   • body length is capped at 8000 chars to prevent pathological
 *     megabyte writes
 *   • channel must be one of the known enum values (defense beyond TS)
 *
 * Db is mocked so no real rows are written; the goal is to verify
 * guards fire before any DB call.
 */

const state = {
  patientExists: false,
  memberExists: false,
  threadExists: false,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => {
  const handler = {
    select: (_sel?: unknown) => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () => {
            if (t === 'patient') return state.patientExists ? [{ id: 'pat_1' }] : []
            if (t === 'member') return state.memberExists ? [{ id: 'usr_1' }] : []
            if (t === 'patientThread') return state.threadExists ? [{ id: 'thr_1' }] : []
            return []
          },
        }),
      }),
    }),
    insert: (t: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        state.inserts.push({ table: String(t), values })
      },
    }),
    update: (t: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => { state.updates.push({ table: String(t), set }) },
      }),
    }),
  }
  return {
    db: handler,
    schema: {
      patient: 'patient',
      member: 'member',
      patientThread: 'patientThread',
      patientMessage: 'patientMessage',
      emailMessage: 'emailMessage',
      user: 'user',
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  desc: vi.fn(() => ({ _: 'desc' })),
  asc: vi.fn(() => ({ _: 'asc' })),
  ilike: vi.fn(() => ({ _: 'ilike' })),
  gte: vi.fn(() => ({ _: 'gte' })),
  lte: vi.fn(() => ({ _: 'lte' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  count: vi.fn(() => ({ _: 'count' })),
  or: vi.fn(() => ({ _: 'or' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

beforeEach(() => {
  state.patientExists = false
  state.memberExists = false
  state.threadExists = false
  state.inserts = []
  state.updates = []
})

describe('sendMessageToPatient — cross-tenant + body guards', () => {
  it('rejects when the patientId does not belong to the org', async () => {
    state.patientExists = false
    const { sendMessageToPatient } = await import('@/lib/services/patient-messaging')
    await expect(
      sendMessageToPatient({
        organizationId: 'org_real',
        patientId: 'pat_foreign',
        body: 'hi',
        channel: 'in_app',
        sentByUserId: 'usr_1',
      }),
    ).rejects.toThrow(/not found in this organization/i)
    expect(state.inserts).toHaveLength(0)
  })

  it('rejects an empty body before touching the DB', async () => {
    state.patientExists = true
    const { sendMessageToPatient } = await import('@/lib/services/patient-messaging')
    await expect(
      sendMessageToPatient({
        organizationId: 'org_real',
        patientId: 'pat_1',
        body: '   ',
        channel: 'in_app',
        sentByUserId: 'usr_1',
      }),
    ).rejects.toThrow(/cannot be empty/i)
    expect(state.inserts).toHaveLength(0)
  })

  it('rejects a body over the 8000-character cap', async () => {
    state.patientExists = true
    const { sendMessageToPatient } = await import('@/lib/services/patient-messaging')
    const huge = 'x'.repeat(8001)
    await expect(
      sendMessageToPatient({
        organizationId: 'org_real',
        patientId: 'pat_1',
        body: huge,
        channel: 'in_app',
        sentByUserId: 'usr_1',
      }),
    ).rejects.toThrow(/8000 character limit/i)
    expect(state.inserts).toHaveLength(0)
  })

  it('rejects an invalid channel value at runtime (defense beyond TS)', async () => {
    state.patientExists = true
    const { sendMessageToPatient } = await import('@/lib/services/patient-messaging')
    await expect(
      sendMessageToPatient({
        organizationId: 'org_real',
        patientId: 'pat_1',
        body: 'ok',
        // Forced through `as never` to simulate an untyped caller.
        channel: 'voicemail' as never,
        sentByUserId: 'usr_1',
      }),
    ).rejects.toThrow(/Invalid channel/i)
    expect(state.inserts).toHaveLength(0)
  })

  it('still rejects SMS until Phase B wires the send adapter', async () => {
    state.patientExists = true
    const { sendMessageToPatient } = await import('@/lib/services/patient-messaging')
    await expect(
      sendMessageToPatient({
        organizationId: 'org_real',
        patientId: 'pat_1',
        body: 'ok',
        channel: 'sms',
        sentByUserId: 'usr_1',
      }),
    ).rejects.toThrow(/SMS channel is not enabled/i)
    expect(state.inserts).toHaveLength(0)
  })
})

describe('recordInboundMessage — cross-tenant + body guards', () => {
  it('rejects when the patientId does not belong to the org', async () => {
    state.patientExists = false
    const { recordInboundMessage } = await import('@/lib/services/patient-messaging')
    await expect(
      recordInboundMessage({
        organizationId: 'org_real',
        patientId: 'pat_foreign',
        body: 'hi',
        channel: 'in_app',
      }),
    ).rejects.toThrow(/not found in this organization/i)
    expect(state.inserts).toHaveLength(0)
  })

  it('rejects an empty body before touching the DB', async () => {
    state.patientExists = true
    const { recordInboundMessage } = await import('@/lib/services/patient-messaging')
    await expect(
      recordInboundMessage({
        organizationId: 'org_real',
        patientId: 'pat_1',
        body: '',
        channel: 'in_app',
      }),
    ).rejects.toThrow(/cannot be empty/i)
    expect(state.inserts).toHaveLength(0)
  })
})

describe('assignThread — cross-tenant assignee guard', () => {
  it('rejects assigning to a user who is not a member of the org', async () => {
    state.memberExists = false
    const { assignThread } = await import('@/lib/services/patient-messaging')
    await expect(
      assignThread('org_real', 'thr_1', 'usr_foreign'),
    ).rejects.toThrow(/not a member of this organization/i)
    expect(state.updates).toHaveLength(0)
  })

  it('allows unassigning (null assigneeUserId) without a membership check', async () => {
    state.memberExists = false // would reject if check ran
    const { assignThread } = await import('@/lib/services/patient-messaging')
    await assignThread('org_real', 'thr_1', null)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].set).toMatchObject({ assignedUserId: null })
  })

  it('writes when assignee is a member of the org', async () => {
    state.memberExists = true
    const { assignThread } = await import('@/lib/services/patient-messaging')
    await assignThread('org_real', 'thr_1', 'usr_1')
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].set).toMatchObject({ assignedUserId: 'usr_1' })
  })
})

describe('findPatientThread — read-only lookup', () => {
  it('returns null when no thread exists (does NOT create)', async () => {
    state.threadExists = false
    const { findPatientThread } = await import('@/lib/services/patient-messaging')
    const result = await findPatientThread('org_real', 'pat_1')
    expect(result).toBeNull()
    // No insert on a lookup-only call.
    expect(state.inserts).toHaveLength(0)
  })

  it('returns the thread id when one exists', async () => {
    state.threadExists = true
    const { findPatientThread } = await import('@/lib/services/patient-messaging')
    const result = await findPatientThread('org_real', 'pat_1')
    expect(result).toBe('thr_1')
    expect(state.inserts).toHaveLength(0)
  })
})
