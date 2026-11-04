import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * submitReviewText must only complete an IN-FLIGHT request. A held/forwarded
 * token must not be able to resurrect a staff-`skipped` request or complete a
 * `failed` send (which never reached the patient + must not lock the rate
 * limit). `completed` is still allowed (the documented idempotent edit).
 */

const state = {
  row: null as null | { id: string; organizationId: string; patientId: string; status: string },
  updates: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (state.row ? [state.row] : []),
        }),
      }),
    }),
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => { state.updates.push(set) },
      }),
    }),
  },
  schema: {
    reviewRequest: { id: 'id', organizationId: 'organizationId', patientId: 'patientId', status: 'status', token: 'token', completedAt: 'completedAt' },
    patient: { id: 'id', organizationId: 'organizationId', firstName: 'firstName', lastName: 'lastName' },
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  desc: vi.fn((x) => x),
  asc: vi.fn((x) => x),
  gte: vi.fn(() => ({ _: 'gte' })),
  lte: vi.fn(() => ({ _: 'lte' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  count: vi.fn(() => ({ _: 'count' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

vi.mock('resend', () => ({ Resend: class { emails = { send: async () => ({ id: 'm' }) } } }))

const { notifyOrgMembersMock } = vi.hoisted(() => ({ notifyOrgMembersMock: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: notifyOrgMembersMock }))

// ML-21: the follow-up filed beside a 1–2★ bell (one per note).
const { followupMock } = vi.hoisted(() => ({
  followupMock: vi.fn(async (..._a: unknown[]): Promise<{ id: string; created: boolean } | null> => ({ id: 'fu_1', created: true })),
}))
vi.mock('@/lib/services/patient-followups', () => ({ autoCreateFeedbackFollowup: followupMock }))

import { submitReviewText } from '@/lib/services/reviews'

beforeEach(() => {
  state.row = null
  state.updates = []
  notifyOrgMembersMock.mockClear()
  notifyOrgMembersMock.mockResolvedValue(undefined)
  followupMock.mockClear()
  followupMock.mockResolvedValue({ id: 'fu_1', created: true })
})

function reqWithStatus(status: string) {
  state.row = { id: 'rr_1', organizationId: 'org_1', patientId: 'pat_1', status }
}

describe('submitReviewText status gate', () => {
  for (const status of ['sent', 'clicked', 'completed']) {
    it(`accepts a '${status}' request`, async () => {
      reqWithStatus(status)
      const res = await submitReviewText({ token: 'tok', text: 'Great visit, thank you.' })
      expect(res.ok).toBe(true)
      expect(state.updates).toHaveLength(1)
      expect((state.updates[0] as { status: string }).status).toBe('completed')
    })
  }

  for (const status of ['pending', 'skipped', 'failed']) {
    it(`rejects a '${status}' request without writing`, async () => {
      reqWithStatus(status)
      const res = await submitReviewText({ token: 'tok', text: 'Trying to slip through.' })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toMatch(/no longer active/i)
      expect(state.updates).toHaveLength(0)
    })
  }

  it('rejects an unknown token', async () => {
    state.row = null
    const res = await submitReviewText({ token: 'nope', text: 'hello there' })
    expect(res.ok).toBe(false)
    expect(state.updates).toHaveLength(0)
  })

  it('rejects empty + oversize text before any lookup', async () => {
    reqWithStatus('sent')
    expect((await submitReviewText({ token: 'tok', text: '   ' })).ok).toBe(false)
    expect((await submitReviewText({ token: 'tok', text: 'x'.repeat(2001) })).ok).toBe(false)
    expect(state.updates).toHaveLength(0)
  })
})

describe('submitReviewText notifications', () => {
  it('pings owners/admins with the rating → /growth/reviews/received on a completed submit', async () => {
    reqWithStatus('sent')
    const res = await submitReviewText({ token: 'tok', text: 'Best cleaning ever.', rating: 5 })
    expect(res.ok).toBe(true)
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({
        type: 'review_submitted',
        title: expect.stringContaining('5★'),
        linkPath: '/growth/reviews/received',
      }),
      { roles: ['owner', 'admin'], excludeEmail: null },
    )
  })

  it('escalates a 1–2★ submission with an urgent, force-emailed service-recovery alert that lands on the ONE follow-up it filed', async () => {
    reqWithStatus('sent')
    const res = await submitReviewText({ token: 'tok', text: 'Long wait, felt rushed.', rating: 2 })
    expect(res.ok).toBe(true)
    // ML-21: filed once, per note, keyed on the request row.
    expect(followupMock).toHaveBeenCalledTimes(1)
    expect(followupMock).toHaveBeenCalledWith(
      'org_1',
      'pat_1',
      undefined,
      expect.objectContaining({ kind: 'review', reviewRequestId: 'rr_1', rating: 2 }),
    )
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({
        type: 'review_low_rating',
        forceEmail: true,
        title: expect.stringContaining('before it goes public'),
        linkPath: '/patients/pat_1#followups',
        linkLabel: 'Open the follow-up →',
      }),
      { roles: ['owner', 'admin'], excludeEmail: null },
    )
  })

  it('a 1–2★ bell whose follow-up could not be filed still rings — at the received page', async () => {
    followupMock.mockResolvedValueOnce(null)
    reqWithStatus('sent')
    await submitReviewText({ token: 'tok', text: 'Long wait, felt rushed.', rating: 1 })
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({ type: 'review_low_rating', linkPath: '/growth/reviews/received' }),
      { roles: ['owner', 'admin'], excludeEmail: null },
    )
  })

  it('keeps a 3★+ submission on the normal (non-urgent) alert — and files no follow-up', async () => {
    reqWithStatus('sent')
    await submitReviewText({ token: 'tok', text: 'Nice people.', rating: 4 })
    expect(followupMock).not.toHaveBeenCalled()
  })

  it('keeps a 3★+ submission on the normal (non-urgent) alert', async () => {
    reqWithStatus('sent')
    await submitReviewText({ token: 'tok', text: 'It was fine.', rating: 3 })
    // The normal 'review_submitted' type fired (not the urgent low-rating one).
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({ type: 'review_submitted' }),
      { roles: ['owner', 'admin'], excludeEmail: null },
    )
  })

  it('does NOT notify when the submission is rejected (e.g. skipped request)', async () => {
    reqWithStatus('skipped')
    const res = await submitReviewText({ token: 'tok', text: 'Trying to slip through.' })
    expect(res.ok).toBe(false)
    expect(notifyOrgMembersMock).not.toHaveBeenCalled()
  })

  it('still completes the review when the notify throws', async () => {
    notifyOrgMembersMock.mockRejectedValueOnce(new Error('notify boom'))
    reqWithStatus('clicked')
    const res = await submitReviewText({ token: 'tok', text: 'Lovely visit.' })
    expect(res.ok).toBe(true)
    expect((state.updates[0] as { status: string }).status).toBe('completed')
  })
})
