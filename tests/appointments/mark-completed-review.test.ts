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

type FireOutcome = { outcome: 'sent' | 'skipped' | 'failed'; error?: string }
const { getReviewConfigMock, shouldSendImmediatelyMock, fireMock } = vi.hoisted(() => ({
  getReviewConfigMock: vi.fn(async () => ({})),
  shouldSendImmediatelyMock: vi.fn(() => true),
  fireMock: vi.fn<() => Promise<FireOutcome>>(async () => ({ outcome: 'sent' })),
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

/** assertAppointmentMutable (status) → then the row lookup (patientId +
 *  source/createdAt/startTime for the pms_live re-stamp rule). */
function queueContext(
  status = 'scheduled',
  row: Record<string, unknown> = { patientId: 'pat_1' },
) {
  state.selectQueue.push([{ status }])
  state.selectQueue.push([row])
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

describe("markCompleted → the 'pms_live' re-stamp (round-5 close-out)", () => {
  // Same rule as the PMS delta sync's goingLiveCompleted: a backfilled
  // UPCOMING row whose completion STAFF observe re-stamps 'pms_live' so the
  // SEATED journey transition can mint. Without it, the same visit counted
  // (or not) depending on whether the cron or the front desk noticed first.
  const NOW = Date.now()

  it("re-stamps a 'pms_import' row that was upcoming at import time", async () => {
    queueContext('scheduled', {
      patientId: 'pat_1',
      source: 'pms_import',
      createdAt: new Date(NOW - 3 * 24 * 60 * 60 * 1000), // imported 3 days ago
      startTime: new Date(NOW - 60 * 60 * 1000), // the visit was this morning
    })
    await markCompleted('org_1', 'appt_1')
    const completion = state.updates.find((u) => u.status === 'completed')!
    expect(completion.source).toBe('pms_live')
  })

  it("leaves a HISTORICAL 'pms_import' row alone (startTime long before its own import)", async () => {
    queueContext('scheduled', {
      patientId: 'pat_1',
      source: 'pms_import',
      createdAt: new Date(NOW - 3 * 24 * 60 * 60 * 1000),
      startTime: new Date(NOW - 90 * 24 * 60 * 60 * 1000), // months-old history
    })
    await markCompleted('org_1', 'appt_1')
    const completion = state.updates.find((u) => u.status === 'completed')!
    expect(completion.source).toBeUndefined()
  })

  it('never touches the source of a non-import row', async () => {
    queueContext('scheduled', {
      patientId: 'pat_1',
      source: 'booking_widget',
      createdAt: new Date(NOW - 30 * 24 * 60 * 60 * 1000),
      startTime: new Date(NOW - 60 * 60 * 1000),
    })
    await markCompleted('org_1', 'appt_1')
    const completion = state.updates.find((u) => u.status === 'completed')!
    expect(completion.source).toBeUndefined()
  })
})
