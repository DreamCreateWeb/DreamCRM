import { describe, it, expect, vi, beforeEach } from 'vitest'

let tenantCtx: {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  organizationId: string
  organizationSlug: string
} | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const ops: Array<{ kind: 'insert' | 'update' | 'delete'; table: string; values?: unknown }> = []
// Rows the "does this org already have a location?" probe returns. Default (set in
// beforeEach) is one existing row, so a plain add is a SUBSEQUENT location; the
// first-location-is-primary path is covered in locations-add-primary.test.ts.
let selectRows: Array<{ id: string }> = []

vi.mock('@/lib/db', async () => {
  const { clinicLocation } = await import('@/lib/db/schema/platform')
  const name = (t: unknown) => (t === clinicLocation ? 'clinic_location' : 'unknown')
  return {
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => selectRows }) }) }),
      insert: (table: unknown) => ({
        values: async (v: unknown) => ops.push({ kind: 'insert', table: name(table), values: v }),
      }),
      update: (table: unknown) => ({
        set: (v: unknown) => ({
          where: async () => ops.push({ kind: 'update', table: name(table), values: v }),
        }),
      }),
      delete: (table: unknown) => ({
        where: async () => ops.push({ kind: 'delete', table: name(table) }),
      }),
    },
  }
})

import {
  addLocation,
  deleteLocation,
  setPrimaryLocation,
} from '@/app/(default)/settings/locations/actions'

beforeEach(() => {
  ops.length = 0
  selectRows = [{ id: 'loc_existing' }]
  tenantCtx = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationSlug: 'acme',
  }
})

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('addLocation', () => {
  it('rejects when tenant is not a clinic', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', organizationId: 'org_p', organizationSlug: 'dream' }
    await expect(addLocation(form({ name: 'X' }))).rejects.toThrow(/clinic/i)
  })

  it('rejects when role is not owner/admin', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    await expect(addLocation(form({ name: 'X' }))).rejects.toThrow(/owner|admin/i)
  })

  it('rejects when name is missing', async () => {
    await expect(addLocation(form({}))).rejects.toThrow(/name/i)
  })

  it('inserts a location row', async () => {
    await addLocation(
      form({
        name: 'Main Office',
        addressLine1: '123 Main',
        city: 'Austin',
        state: 'TX',
      }),
    )
    const insertOp = ops.find((o) => o.kind === 'insert')!
    expect(insertOp.table).toBe('clinic_location')
    const v = insertOp.values as { name: string; isPrimary: number }
    expect(v.name).toBe('Main Office')
    expect(v.isPrimary).toBe(0)
  })

  it('clears previous primaries when adding a new primary', async () => {
    await addLocation(form({ name: 'Main', isPrimary: 'on' }))
    const updateOp = ops.find((o) => o.kind === 'update')
    expect(updateOp).toBeDefined()
    expect(updateOp!.table).toBe('clinic_location')
    expect((updateOp!.values as { isPrimary: number }).isPrimary).toBe(0)
    const insertOp = ops.find((o) => o.kind === 'insert')!
    expect((insertOp.values as { isPrimary: number }).isPrimary).toBe(1)
  })
})

describe('deleteLocation', () => {
  it('deletes the location', async () => {
    await deleteLocation('loc_1')
    expect(ops).toHaveLength(1)
    expect(ops[0].kind).toBe('delete')
    expect(ops[0].table).toBe('clinic_location')
  })

  it('rejects from non-clinic admin', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', organizationId: 'org_p', organizationSlug: 'dream' }
    await expect(deleteLocation('loc_1')).rejects.toThrow(/clinic/i)
  })
})

describe('setPrimaryLocation', () => {
  it('clears all primaries then sets the new one', async () => {
    await setPrimaryLocation('loc_target')
    const updates = ops.filter((o) => o.kind === 'update')
    expect(updates).toHaveLength(2)
    expect((updates[0].values as { isPrimary: number }).isPrimary).toBe(0)
    expect((updates[1].values as { isPrimary: number }).isPrimary).toBe(1)
  })
})
