import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * markCompleted is the trigger for the Google-first review loop: completing a
 * visit auto-fires a review request when the clinic has auto-send on with a
 * 0-hour delay. It must be best-effort (a send failure never fails the
 * completion) and route through fireReviewRequestForAppointment (whose
 * per-appointment dedupe is the double-send guard, covered in auto-send.test.ts).
 */

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    return obj
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({ set: (s: Record<string, unknown>) => ({ where: async () => { state.updates.push(s) } }) }),
    },
    schema: {
      appointment: { organizationId: 'org', id: 'id', status: 'status', patientId: 'patientId' },
      patient: { organizationId: 'org', id: 'id', lastActivityAt: 'lastActivityAt' },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })), eq: vi.fn(() => ({ _: 'eq' })), asc: vi.fn((x) => x),
  desc: vi.fn((x) => x), gte: vi.fn(() => ({ _: 'gte' })), lte: vi.fn(() => ({ _: 'lte' })),
  ne: vi.fn(() => ({ _: 'ne' })), or: vi.fn(() => ({ _: 'or' })), inArray: vi.fn(() => ({ _: 'inArray' })),
  isNull: vi.fn(() => ({ _: 'isNull' })), isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

vi.mock('@/lib/services/pms', () => ({
  queueAppointmentWriteBack: vi.fn(async () => undefined),
  queueAppointmentStatusWriteBack: vi.fn(async () => undefined),
}))

const { getReviewConfigMock, shouldSendImmediatelyMock, fireMock } = vi.hoisted(() => ({
  getReviewConfigMock: vi.fn(async () => ({})),
  shouldSendImmediatelyMock: vi.fn(() => true),
  fireMock: vi.fn(async () => ({ outcome: 'sent' as const })),
}))
vi.mock('@/lib/services/reviews', () => ({
  getReviewConfig: getReviewConfigMock,
  shouldSendImmediately: shouldSendImmediatelyMock,
  fireReviewRequestForAppointment: fireMock,
}))

import { markCompleted } from '@/lib/services/appointments'

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  vi.clearAllMocks()
  shouldSendImmediatelyMock.mockReturnValue(true)
  fireMock.mockResolvedValue({ outcome: 'sent' })
})

/** assertAppointmentMutable (status) → then the patientId lookup. */
function queueContext(status = 'scheduled') {
  state.selectQueue.push([{ status }])
  state.selectQueue.push([{ patientId: 'pat_1' }])
}

describe('markCompleted → review auto-send', () => {
  it('fires the review request and reports reviewSent when send succeeds', async () => {
    queueContext()
    const r = await markCompleted('org_1', 'appt_1')
    expect(fireMock).toHaveBeenCalledWith('org_1', 'appt_1', 'pat_1')
    expect(r.reviewSent).toBe(true)
    // The completion itself was written.
    expect(state.updates.some((u) => u.status === 'completed')).toBe(true)
  })

  it('does NOT fire when the clinic has immediate auto-send off', async () => {
    shouldSendImmediatelyMock.mockReturnValue(false)
    queueContext()
    const r = await markCompleted('org_1', 'appt_1')
    expect(fireMock).not.toHaveBeenCalled()
    expect(r.reviewSent).toBe(false)
  })

  it('reports reviewSent=false when the send is skipped (e.g. opted out / dedupe)', async () => {
    fireMock.mockResolvedValue({ outcome: 'skipped' })
    queueContext()
    const r = await markCompleted('org_1', 'appt_1')
    expect(r.reviewSent).toBe(false)
  })

  it('still completes the visit when the review trigger throws (best-effort)', async () => {
    fireMock.mockRejectedValueOnce(new Error('reviews boom'))
    queueContext()
    const r = await markCompleted('org_1', 'appt_1')
    expect(r.reviewSent).toBe(false)
    expect(state.updates.some((u) => u.status === 'completed')).toBe(true)
  })
})
