import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * setArrivalState — the lean in-office flow. Only live visits move; 'seated'
 * backfills arrivedAt; 'reset' clears both (mis-tap escape hatch).
 */

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.leftJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({ set: (v: Record<string, unknown>) => ({ where: async () => { state.updates.push(v) } }) }),
    },
    schema: {
      appointment: { id: 'id', organizationId: 'org', status: 's', arrivedAt: 'a', seatedAt: 'se' },
      patient: {}, clinicProvider: {}, clinicLocation: {},
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})), eq: vi.fn(() => ({})), ne: vi.fn(() => ({})), or: vi.fn(() => ({})),
  gte: vi.fn(() => ({})), lte: vi.fn(() => ({})), asc: vi.fn(() => ({})), desc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})), isNotNull: vi.fn(() => ({})), isNull: vi.fn(() => ({})),
  sql: Object.assign((..._a: unknown[]) => ({}), { raw: () => ({}) }),
}))
vi.mock('@/lib/services/patient-tags', () => ({ getTagsForPatient: vi.fn(async () => []) }))
vi.mock('@/lib/services/clinic-cadence', () => ({
  getClinicCadence: vi.fn(async () => ({ recallMonths: 6, lapsedMonths: 18 })),
}))

import { setArrivalState } from '@/lib/services/appointments'

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  vi.clearAllMocks()
})

describe('setArrivalState', () => {
  it('marks a live visit arrived (seatedAt stays clear)', async () => {
    state.selectQueue.push([{ status: 'confirmed', arrivedAt: null }])
    expect(await setArrivalState('org_1', 'a1', 'arrived')).toEqual({ ok: true })
    expect(state.updates[0]).toMatchObject({ seatedAt: null })
    expect(state.updates[0].arrivedAt).toBeInstanceOf(Date)
  })

  it('seating backfills arrivedAt when the arrival tap was skipped', async () => {
    state.selectQueue.push([{ status: 'scheduled', arrivedAt: null }])
    await setArrivalState('org_1', 'a1', 'seated')
    expect(state.updates[0].arrivedAt).toBeInstanceOf(Date)
    expect(state.updates[0].seatedAt).toBeInstanceOf(Date)
  })

  it('seating preserves the original arrival time', async () => {
    const arrived = new Date('2026-07-02T14:00:00Z')
    state.selectQueue.push([{ status: 'confirmed', arrivedAt: arrived }])
    await setArrivalState('org_1', 'a1', 'seated')
    expect(state.updates[0].arrivedAt).toBe(arrived)
  })

  it('reset clears both breadcrumbs', async () => {
    state.selectQueue.push([{ status: 'confirmed', arrivedAt: new Date() }])
    await setArrivalState('org_1', 'a1', 'reset')
    expect(state.updates[0]).toMatchObject({ arrivedAt: null, seatedAt: null })
  })

  it('refuses non-live visits and unknown ids', async () => {
    state.selectQueue.push([{ status: 'completed', arrivedAt: null }])
    expect(await setArrivalState('org_1', 'a1', 'arrived')).toMatchObject({ ok: false })
    state.selectQueue.push([])
    expect(await setArrivalState('org_1', 'nope', 'arrived')).toMatchObject({ ok: false })
    expect(state.updates).toHaveLength(0)
  })
})
