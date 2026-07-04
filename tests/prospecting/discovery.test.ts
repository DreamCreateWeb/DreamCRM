import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * NPPES discovery engine — kill-switch/no-states gating, the page loop
 * (short page → phase flip → done), the two-phase org→individual (NPI-1)
 * cursor, the zip3 → zip5 split at the NPPES skip cap, the idle-run
 * self-heal that backfills the solo-dentist pass, error capture (task
 * marked, run continues), and conflict-safe imports.
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Array<Record<string, unknown>> }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
          const list = Array.isArray(values) ? values : [values]
          state.inserts.push({ table: (table as { _n: string })._n, values: list })
          return {
            onConflictDoNothing: () => {
              const p: any = Promise.resolve(undefined)
              // Simulate "every row was new" — returning() echoes the ids.
              p.returning = async () => list.map((v) => ({ id: v.id }))
              return p
            },
          }
        },
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table: (table as { _n: string })._n, values })
          },
        }),
      }),
    },
    schema: {
      prospect: { _n: 'prospect', id: 'id', npiNumber: 'npi' },
      prospectDiscoveryTask: {
        _n: 'prospect_discovery_task',
        id: 'id', state: 'state', zipPrefix: 'zip', skip: 'skip',
        status: 'status', found: 'found', imported: 'imported', updatedAt: 'u',
        entityPhase: 'entity_phase', error: 'error',
      },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
}))

const { searchMock, configMock } = vi.hoisted(() => ({
  searchMock: vi.fn(),
  configMock: vi.fn(),
}))
vi.mock('@/lib/nppes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nppes')>()
  return { ...actual, searchNppesOrgs: searchMock }
})
vi.mock('@/lib/services/prospecting', () => ({ getProspectingConfig: configMock }))

import { runDiscovery } from '@/lib/services/prospect-discovery'
import { PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'

const LIVE_CONFIG = {
  ...PROSPECTING_DEFAULTS,
  killSwitch: false,
  enabledStates: ['GA'],
}

const TASK = {
  id: 'pdt_1', state: 'GA', zipPrefix: '303', skip: 0,
  status: 'pending', found: 0, imported: 0, error: null, entityPhase: 'org',
  createdAt: new Date(), updatedAt: new Date(),
}

function org(n: number) {
  return {
    npiNumber: String(1000000000 + n),
    name: `Practice ${n}`,
    addressLine1: `${n} Main St`,
    city: 'Atlanta',
    state: 'GA',
    postalCode: '30309',
    phone: `40455512${String(n % 100).padStart(2, '0')}`,
    taxonomyCode: '122300000X',
    authorizedOfficialName: 'Jane Doe',
    authorizedOfficialTitle: 'OWNER',
  }
}

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  vi.clearAllMocks()
  configMock.mockResolvedValue(LIVE_CONFIG)
})

describe('runDiscovery gating', () => {
  it('no-ops on the kill switch', async () => {
    configMock.mockResolvedValue({ ...LIVE_CONFIG, killSwitch: true })
    const r = await runDiscovery()
    expect(r).toMatchObject({ tasksWorked: 0, skipped: 'kill_switch' })
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('no-ops with no enabled states', async () => {
    configMock.mockResolvedValue({ ...LIVE_CONFIG, enabledStates: [] })
    const r = await runDiscovery()
    expect(r).toMatchObject({ tasksWorked: 0, skipped: 'no_states' })
  })
})

describe('runDiscovery paging', () => {
  it('a short page in the org phase flips to the individual (NPI-1) pass, not done', async () => {
    state.selectQueue.push([TASK]) // claimable tasks
    searchMock.mockResolvedValueOnce({ results: [org(1), org(2)], resultCount: 2 })

    const r = await runDiscovery()
    expect(r).toMatchObject({ tasksWorked: 1, found: 2, imported: 2, split: 0, errors: 0 })
    expect(searchMock).toHaveBeenCalledTimes(1)
    // The org pass queries NPI-2.
    expect(searchMock).toHaveBeenCalledWith({
      state: 'GA', zipPrefix: '303', skip: 0, enumerationType: 'NPI-2',
    })
    // Prospect rows carry identity + tz.
    const prospectInsert = state.inserts.find((i) => i.table === 'prospect')
    expect(prospectInsert!.values[0]).toMatchObject({
      npiNumber: '1000000001',
      state: 'GA',
      timezone: 'America/New_York',
      status: 'discovered',
    })
    // Org well dry → flip to the solo-dentist pass with a fresh cursor.
    const last = state.updates.filter((u) => u.table === 'prospect_discovery_task').at(-1)
    expect(last!.values).toMatchObject({
      status: 'in_progress', entityPhase: 'individual', skip: 0, found: 2, imported: 2,
    })
  })

  it('a short page in the individual phase finishes the task', async () => {
    state.selectQueue.push([{ ...TASK, entityPhase: 'individual' }])
    searchMock.mockResolvedValueOnce({ results: [org(3)], resultCount: 1 })

    const r = await runDiscovery()
    expect(r).toMatchObject({ tasksWorked: 1, imported: 1 })
    // The individual pass queries NPI-1.
    expect(searchMock).toHaveBeenCalledWith({
      state: 'GA', zipPrefix: '303', skip: 0, enumerationType: 'NPI-1',
    })
    const last = state.updates.filter((u) => u.table === 'prospect_discovery_task').at(-1)
    expect(last!.values).toMatchObject({ status: 'done', entityPhase: 'individual' })
  })

  it('splits a zip3 task into zip5-prefix children inheriting the current phase', async () => {
    state.selectQueue.push([{ ...TASK, skip: 1200 }])
    // Full page at skip=1200 → next skip 1400 > cap → split.
    searchMock.mockResolvedValueOnce({
      results: Array.from({ length: 5 }, (_, i) => org(i)),
      resultCount: 200,
    })

    const r = await runDiscovery()
    expect(r.split).toBe(10)
    const children = state.inserts.find(
      (i) => i.table === 'prospect_discovery_task' && i.values.length === 10,
    )
    expect(children!.values.map((v) => v.zipPrefix)).toEqual([
      '3030', '3031', '3032', '3033', '3034', '3035', '3036', '3037', '3038', '3039',
    ])
    // Children inherit the parent's org phase.
    expect(children!.values.every((v) => v.entityPhase === 'org')).toBe(true)
    // Parent org well is dry after the split → flip to the individual pass.
    const last = state.updates.filter((u) => u.table === 'prospect_discovery_task').at(-1)
    expect(last!.values).toMatchObject({ status: 'in_progress', entityPhase: 'individual' })
  })

  it('captures a task error without failing the run', async () => {
    state.selectQueue.push([TASK, { ...TASK, id: 'pdt_2', zipPrefix: '304' }])
    searchMock.mockRejectedValueOnce(new Error('NPPES 503'))
    searchMock.mockResolvedValueOnce({ results: [org(9)], resultCount: 1 })

    const r = await runDiscovery()
    expect(r).toMatchObject({ tasksWorked: 2, errors: 1, imported: 1 })
    const errored = state.updates.find((u) => u.values.status === 'error')
    expect(errored!.values.error).toContain('NPPES 503')
  })
})

describe('runDiscovery idle-run self-heal', () => {
  it('on an idle run, backfills the solo-dentist pass on already-done org tasks', async () => {
    state.selectQueue.push([]) // no claimable tasks → idle run
    searchMock.mockClear()

    const r = await runDiscovery()
    expect(r.tasksWorked).toBe(0)
    expect(searchMock).not.toHaveBeenCalled()
    // The idle block flips done/org tasks back to a pending individual pass.
    const heal = state.updates.find(
      (u) =>
        u.table === 'prospect_discovery_task' &&
        u.values.status === 'pending' &&
        u.values.entityPhase === 'individual',
    )
    expect(heal).toBeTruthy()
    expect(heal!.values).toMatchObject({ skip: 0 })
  })
})
