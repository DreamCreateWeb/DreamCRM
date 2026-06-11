import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Providers CRUD — org-scoping + role normalization + soft deactivate. The DB
 * is mocked to capture inserts/updates and the where-clause args so we can
 * assert org-scoping is applied on every read + write.
 */

const state = {
  selectRows: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown>; where: unknown }>,
  // Record the args passed to eq() so we can prove org-scoping.
  eqCalls: [] as Array<[unknown, unknown]>,
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: async () => state.selectRows,
        }),
      }),
    }),
    insert: (t: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        state.inserts.push({ table: String(t), values })
      },
    }),
    update: (t: unknown) => ({
      set: (s: Record<string, unknown>) => ({
        where: async (w: unknown) => {
          state.updates.push({ table: String(t), set: s, where: w })
        },
      }),
    }),
  },
  schema: {
    clinicProvider: 'clinic_provider',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args) => ({ _kind: 'and', args })),
  eq: vi.fn((col, val) => {
    state.eqCalls.push([col, val])
    return { _kind: 'eq', col, val }
  }),
  asc: vi.fn((x) => x),
}))

// newProviderId comes from appointments.ts — stub it so providers.ts gets a
// deterministic id without pulling the whole appointments module graph.
vi.mock('@/lib/services/appointments', () => ({
  newProviderId: () => 'prov_test123',
}))

import {
  listProviders,
  createProvider,
  updateProvider,
  deactivateProvider,
  normalizeProviderRole,
} from '@/lib/services/providers'

beforeEach(() => {
  state.selectRows = []
  state.inserts = []
  state.updates = []
  state.eqCalls = []
})

describe('normalizeProviderRole', () => {
  it('keeps known roles, defaults unknown to dentist', () => {
    expect(normalizeProviderRole('hygienist')).toBe('hygienist')
    expect(normalizeProviderRole('HYGIENIST')).toBe('hygienist')
    expect(normalizeProviderRole('wizard')).toBe('dentist')
    expect(normalizeProviderRole(null)).toBe('dentist')
    expect(normalizeProviderRole(undefined)).toBe('dentist')
  })
})

describe('listProviders', () => {
  it('maps rows + isActive int → boolean and scopes to the org', async () => {
    state.selectRows = [
      { id: 'p1', displayName: 'Dr. Reyes', role: 'dentist', email: null, isActive: 1 },
      { id: 'p2', displayName: 'Maria Vega', role: 'hygienist', email: 'm@x.example', isActive: 0 },
    ]
    const got = await listProviders('org_1')
    expect(got[0].isActive).toBe(true)
    expect(got[1].isActive).toBe(false)
    // Org scoping: the first eq() call is organizationId === org_1.
    expect(state.eqCalls.some(([, val]) => val === 'org_1')).toBe(true)
  })

  it('activeOnly adds the isActive filter', async () => {
    state.selectRows = []
    await listProviders('org_1', { activeOnly: true })
    // Two eq() filters when activeOnly: org + isActive=1.
    expect(state.eqCalls.some(([, val]) => val === 1)).toBe(true)
  })
})

describe('createProvider', () => {
  it('inserts an org-scoped provider with a normalized role', async () => {
    const id = await createProvider({ organizationId: 'org_1', displayName: '  Dr. New  ', role: 'wizard' })
    expect(id).toBe('prov_test123')
    const ins = state.inserts.find((i) => i.table === 'clinic_provider')!
    expect(ins.values.organizationId).toBe('org_1')
    expect(ins.values.displayName).toBe('Dr. New') // trimmed
    expect(ins.values.role).toBe('dentist') // normalized
  })

  it('throws on an empty name', async () => {
    await expect(createProvider({ organizationId: 'org_1', displayName: '   ' })).rejects.toThrow(/name is required/i)
    expect(state.inserts).toHaveLength(0)
  })
})

describe('updateProvider', () => {
  it('applies only the provided patch fields + always org-scopes the where', async () => {
    await updateProvider({ organizationId: 'org_1', providerId: 'p1', patch: { role: 'hygienist', isActive: false } })
    const upd = state.updates.find((u) => u.table === 'clinic_provider')!
    expect(upd.set.role).toBe('hygienist')
    expect(upd.set.isActive).toBe(0) // boolean → int
    expect(upd.set.displayName).toBeUndefined()
    // org-scoping present in the eq() calls for the where clause.
    expect(state.eqCalls.some(([, val]) => val === 'org_1')).toBe(true)
    expect(state.eqCalls.some(([, val]) => val === 'p1')).toBe(true)
  })

  it('rejects an empty rename', async () => {
    await expect(
      updateProvider({ organizationId: 'org_1', providerId: 'p1', patch: { displayName: '  ' } }),
    ).rejects.toThrow(/name is required/i)
  })
})

describe('deactivateProvider', () => {
  it('soft-deactivates (isActive=0), never deletes', async () => {
    await deactivateProvider('org_1', 'p1')
    const upd = state.updates.find((u) => u.table === 'clinic_provider')!
    expect(upd.set.isActive).toBe(0)
  })
})
