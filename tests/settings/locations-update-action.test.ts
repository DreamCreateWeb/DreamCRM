import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Covers updateLocation (edit-in-place + the primary-promotion invariant) added
 * to the Practice-locations page this session. The add/delete/setPrimary basics
 * live in location-actions.test.ts.
 */

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

type Op = { kind: 'insert' | 'update' | 'delete'; table: string; values?: unknown }
const ops: Op[] = []

vi.mock('@/lib/db', async () => {
  const { clinicLocation } = await import('@/lib/db/schema/platform')
  const name = (t: unknown) => (t === clinicLocation ? 'clinic_location' : 'unknown')
  return {
    db: {
      insert: (table: unknown) => ({
        values: async (v: unknown) => {
          ops.push({ kind: 'insert', table: name(table), values: v })
        },
      }),
      update: (table: unknown) => ({
        set: (v: unknown) => ({
          where: async () => {
            ops.push({ kind: 'update', table: name(table), values: v })
          },
        }),
      }),
      delete: (table: unknown) => ({
        where: async () => {
          ops.push({ kind: 'delete', table: name(table) })
        },
      }),
    },
  }
})

import { updateLocation } from '@/app/(default)/settings/locations/actions'

beforeEach(() => {
  ops.length = 0
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

describe('updateLocation', () => {
  it('rejects a non-clinic tenant', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', organizationId: 'org_p', organizationSlug: 'dream' }
    await expect(updateLocation('loc_1', form({ name: 'X' }))).rejects.toThrow(/clinic/i)
  })

  it('rejects a member (non owner/admin)', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    await expect(updateLocation('loc_1', form({ name: 'X' }))).rejects.toThrow(/owner|admin/i)
  })

  it('rejects a missing name', async () => {
    await expect(updateLocation('loc_1', form({ city: 'Austin' }))).rejects.toThrow(/name/i)
  })

  it('updates the row and does NOT touch isPrimary when not promoting', async () => {
    await updateLocation('loc_1', form({ name: 'Main Office', city: 'Austin', state: 'TX' }))
    const updates = ops.filter((o) => o.kind === 'update')
    expect(updates).toHaveLength(1) // only the row update, no demote sweep
    const v = updates[0].values as Record<string, unknown>
    expect(v.name).toBe('Main Office')
    expect(v.city).toBe('Austin')
    expect('isPrimary' in v).toBe(false)
  })

  it('demotes other rows then sets this one primary when promoting', async () => {
    await updateLocation('loc_1', form({ name: 'Main', isPrimary: 'on' }))
    const updates = ops.filter((o) => o.kind === 'update')
    expect(updates).toHaveLength(2)
    // first sweep clears others
    expect((updates[0].values as { isPrimary: number }).isPrimary).toBe(0)
    // then this row is set primary
    expect((updates[1].values as { isPrimary: number }).isPrimary).toBe(1)
  })

  it('collapses empty address fields to null', async () => {
    await updateLocation('loc_1', form({ name: 'Main', addressLine2: '   ' }))
    const v = ops.find((o) => o.kind === 'update')!.values as Record<string, unknown>
    expect(v.addressLine2).toBeNull()
  })
})
