import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /c/[token] one-click confirm: token mint/reuse + the confirm state machine
 * (pending → confirmed, idempotent re-click, cancelled/past report their
 * state and never mutate).
 */

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<{ set: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.leftJoin = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    return obj
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({
        set: (set: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ set })
          },
        }),
      }),
    },
    schema: {
      appointment: {
        id: 'id', organizationId: 'org', patientId: 'pid', status: 'status',
        startTime: 'startTime', type: 'type', providerId: 'providerId', confirmToken: 'confirmToken',
      },
      patient: { id: 'id', firstName: 'firstName' },
      clinicProvider: { id: 'id', displayName: 'displayName' },
      clinicProfile: { organizationId: 'org', displayName: 'displayName', brandColor: 'b', logoUrl: 'l', phone: 'p', timezone: 'tz', visitTypeSettings: 'vts' },
      organization: { id: 'id', slug: 'slug', name: 'name' },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
}))

const { commLogMock } = vi.hoisted(() => ({ commLogMock: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/pms', () => ({ queueCommLogWriteBack: commLogMock }))

import {
  getOrCreateConfirmToken,
  confirmVisitByToken,
} from '@/lib/services/appointment-confirm'

const FUTURE = new Date(Date.now() + 30 * 60 * 60 * 1000)
const PAST = new Date(Date.now() - 2 * 60 * 60 * 1000)

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  vi.clearAllMocks()
})

describe('getOrCreateConfirmToken', () => {
  it('reuses an existing token (one link across every journey touch)', async () => {
    state.selectQueue.push([{ id: 'a1', confirmToken: 'ct_existing' }])
    expect(await getOrCreateConfirmToken('org_1', 'a1')).toBe('ct_existing')
    expect(state.updates).toHaveLength(0)
  })

  it('mints a ct_ token when none exists yet', async () => {
    state.selectQueue.push([{ id: 'a1', confirmToken: null }])
    state.selectQueue.push([]) // post-write re-read misses in this mock → falls back to the minted token
    const token = await getOrCreateConfirmToken('org_1', 'a1')
    expect(token).toMatch(/^ct_/)
    expect(state.updates[0]!.set.confirmToken).toBe(token)
  })

  it('returns null for an appointment outside the org (tenant scoping)', async () => {
    state.selectQueue.push([])
    expect(await getOrCreateConfirmToken('org_1', 'a_other')).toBeNull()
  })
})

describe('confirmVisitByToken', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'a1',
    organizationId: 'org_1',
    patientId: 'pat_1',
    status: 'scheduled',
    startTime: FUTURE,
    ...over,
  })

  it('confirms a pending future visit (scheduled → confirmed via email)', async () => {
    state.selectQueue.push([row()])
    expect(await confirmVisitByToken('ct_tok')).toEqual({ ok: true, state: 'confirmed' })
    expect(state.updates[0]!.set).toMatchObject({ status: 'confirmed', confirmedVia: 'email' })
    expect(commLogMock).toHaveBeenCalled()
  })

  it('is idempotent on re-click of an already-confirmed visit', async () => {
    state.selectQueue.push([row({ status: 'confirmed' })])
    expect(await confirmVisitByToken('ct_tok')).toEqual({ ok: true, state: 'confirmed' })
    expect(state.updates).toHaveLength(0) // no second write
  })

  it('reports cancelled without mutating', async () => {
    state.selectQueue.push([row({ status: 'cancelled' })])
    expect(await confirmVisitByToken('ct_tok')).toEqual({ ok: false, state: 'cancelled' })
    expect(state.updates).toHaveLength(0)
  })

  it('reports past for a visit that already started', async () => {
    state.selectQueue.push([row({ startTime: PAST })])
    expect(await confirmVisitByToken('ct_tok')).toEqual({ ok: false, state: 'past' })
    expect(state.updates).toHaveLength(0)
  })

  it('unknown token → not ok', async () => {
    state.selectQueue.push([])
    expect((await confirmVisitByToken('ct_nope')).ok).toBe(false)
  })
})
