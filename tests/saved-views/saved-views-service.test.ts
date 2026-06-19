/**
 * The generic saved-views storage. Pins the behavior the patients/appointments
 * services delegate to: list maps rows, create dedups by (surface, name) →
 * UPDATE on a hit / INSERT (with the surface stamped) on a miss, and an empty
 * name is rejected before any DB write.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  existing: [] as Array<{ id: string }>,
  listRows: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<Record<string, unknown>>,
  updated: 0,
  deleted: 0,
}

vi.mock('@/lib/db', () => {
  function chain() {
    const o: Record<string, unknown> = {}
    o.from = () => o
    o.leftJoin = () => o
    o.where = () => o
    o.limit = async () => state.existing // existing-by-name check terminal
    o.orderBy = async () => state.listRows // list terminal
    return o
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({ values: async (v: Record<string, unknown>) => { state.inserted.push(v) } }),
      update: () => ({ set: () => ({ where: async () => { state.updated += 1 } }) }),
      delete: () => ({ where: async () => { state.deleted += 1 } }),
    },
    schema: {
      patientView: { id: 'id', organizationId: 'org', surface: 'surface', name: 'name', createdBy: 'created_by', filters: 'filters', sortOrder: 'sort' },
      user: { id: 'id', name: 'name' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  asc: (x: unknown) => x,
  eq: (...a: unknown[]) => ({ a }),
  sql: Object.assign((s: TemplateStringsArray, ...v: unknown[]) => ({ s, v }), {}),
}))

import { listSavedViews, createSavedView, deleteSavedView } from '@/lib/services/saved-views'

beforeEach(() => {
  state.existing = []
  state.listRows = []
  state.inserted = []
  state.updated = 0
  state.deleted = 0
})

describe('createSavedView', () => {
  it('inserts a new view (surface stamped, pview_ id) when the name is free', async () => {
    const row = await createSavedView('org_1', 'appointments', '  No   shows  ', { attention: ['no_show'] }, 'u1')
    expect(state.inserted).toHaveLength(1)
    expect(state.updated).toBe(0)
    expect(state.inserted[0].surface).toBe('appointments')
    expect(state.inserted[0].name).toBe('No shows') // whitespace collapsed
    expect(row.id).toMatch(/^pview_/)
    expect(row.name).toBe('No shows')
  })

  it('updates the existing view (no insert) on a same-name collision', async () => {
    state.existing = [{ id: 'pview_existing' }]
    const row = await createSavedView('org_1', 'appointments', 'No shows', { attention: ['unconfirmed'] }, 'u1')
    expect(state.inserted).toHaveLength(0)
    expect(state.updated).toBe(1)
    expect(row.id).toBe('pview_existing')
  })

  it('rejects an empty name before touching the db', async () => {
    await expect(createSavedView('org_1', 'leads', '   ', {}, 'u1')).rejects.toThrow(/name/i)
    expect(state.inserted).toHaveLength(0)
    expect(state.updated).toBe(0)
  })
})

describe('listSavedViews', () => {
  it('maps rows + defaults a null filters blob to {}', async () => {
    state.listRows = [
      { id: 'v1', name: 'A', filters: { window: 'past_30d' }, createdByName: 'Reyes' },
      { id: 'v2', name: 'B', filters: null, createdByName: null },
    ]
    const rows = await listSavedViews('org_1', 'appointments')
    expect(rows).toEqual([
      { id: 'v1', name: 'A', filters: { window: 'past_30d' }, createdByName: 'Reyes' },
      { id: 'v2', name: 'B', filters: {}, createdByName: null },
    ])
  })
})

describe('deleteSavedView', () => {
  it('issues a scoped delete', async () => {
    await deleteSavedView('org_1', 'v1')
    expect(state.deleted).toBe(1)
  })
})
