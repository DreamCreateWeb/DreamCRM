import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * submitPrivateFeedback — the "rather tell us privately?" path on /r/<token>.
 * It must write review_request.privateFeedback (NEVER reviewText, so it can't
 * become a public testimonial), gate on an in-flight request, and ping staff
 * (force-emailing a low rating for service recovery).
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

import { submitPrivateFeedback } from '@/lib/services/reviews'

beforeEach(() => {
  state.row = null
  state.updates = []
  notifyOrgMembersMock.mockClear()
  notifyOrgMembersMock.mockResolvedValue(undefined)
})

function reqWithStatus(status: string) {
  state.row = { id: 'rr_1', organizationId: 'org_1', patientId: 'pat_1', status }
}

describe('submitPrivateFeedback', () => {
  it('writes privateFeedback (never reviewText) + selectedSite=private_feedback', async () => {
    reqWithStatus('clicked')
    const res = await submitPrivateFeedback({ token: 'tok', text: 'Wait felt long, but great care.' })
    expect(res.ok).toBe(true)
    expect(state.updates).toHaveLength(1)
    const set = state.updates[0] as Record<string, unknown>
    expect(set.status).toBe('completed')
    expect(set.selectedSite).toBe('private_feedback')
    expect(set.privateFeedback).toBe('Wait felt long, but great care.')
    // Crucially, it must NOT write reviewText — that's what would make it public.
    expect(set.reviewText).toBeUndefined()
  })

  for (const status of ['sent', 'clicked', 'completed']) {
    it(`accepts a '${status}' request`, async () => {
      reqWithStatus(status)
      const res = await submitPrivateFeedback({ token: 'tok', text: 'A private note.' })
      expect(res.ok).toBe(true)
    })
  }

  for (const status of ['pending', 'skipped', 'failed']) {
    it(`rejects a '${status}' request without writing`, async () => {
      reqWithStatus(status)
      const res = await submitPrivateFeedback({ token: 'tok', text: 'slip through' })
      expect(res.ok).toBe(false)
      expect(state.updates).toHaveLength(0)
    })
  }

  it('rejects empty + oversize text before any lookup', async () => {
    reqWithStatus('sent')
    expect((await submitPrivateFeedback({ token: 'tok', text: '   ' })).ok).toBe(false)
    expect((await submitPrivateFeedback({ token: 'tok', text: 'x'.repeat(2001) })).ok).toBe(false)
    expect(state.updates).toHaveLength(0)
  })

  it('force-emails an urgent alert on a 1–2★ note (service recovery)', async () => {
    reqWithStatus('sent')
    const res = await submitPrivateFeedback({ token: 'tok', text: 'Unhappy with the wait.', rating: 2 })
    expect(res.ok).toBe(true)
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({ type: 'review_low_rating', forceEmail: true, linkPath: '/reviews' }),
      { roles: ['owner', 'admin'] },
    )
  })

  it('sends a normal (non-urgent) alert on a 3★+ note', async () => {
    reqWithStatus('sent')
    await submitPrivateFeedback({ token: 'tok', text: 'It was fine.', rating: 4 })
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({ type: 'private_feedback', forceEmail: false }),
      { roles: ['owner', 'admin'] },
    )
  })

  it('still completes when the notify throws', async () => {
    notifyOrgMembersMock.mockRejectedValueOnce(new Error('notify boom'))
    reqWithStatus('clicked')
    const res = await submitPrivateFeedback({ token: 'tok', text: 'A note.' })
    expect(res.ok).toBe(true)
    expect((state.updates[0] as { status: string }).status).toBe('completed')
  })
})
