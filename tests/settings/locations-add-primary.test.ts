import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * addLocation must make the FIRST location primary — even when the form omits
 * `isPrimary`. The first-location checkbox is rendered checked-but-DISABLED, and
 * disabled controls are excluded from FormData, so the flag never submits; the
 * action forces it server-side (the public site's address block needs exactly one
 * primary). Guards the regression where the first location saved as non-primary.
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

type Op = { kind: 'insert' | 'update'; values?: unknown }
const ops: Op[] = []
let existingRows: Array<{ id: string }> = []

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => existingRows,
        }),
      }),
    }),
    insert: () => ({
      values: async (v: unknown) => {
        ops.push({ kind: 'insert', values: v })
      },
    }),
    update: () => ({
      set: (v: unknown) => ({
        where: async () => {
          ops.push({ kind: 'update', values: v })
        },
      }),
    }),
  },
}))

import { addLocation } from '@/app/(default)/settings/locations/actions'

beforeEach(() => {
  ops.length = 0
  existingRows = []
  tenantCtx = { tenantType: 'clinic', role: 'owner', organizationId: 'org_1', organizationSlug: 'acme' }
})

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

function insertedValues() {
  const insert = ops.find((o) => o.kind === 'insert')
  expect(insert).toBeTruthy()
  return insert!.values as Record<string, unknown>
}

describe('addLocation — first location is primary', () => {
  it('forces isPrimary=1 on the first location even when the form omits it', async () => {
    existingRows = [] // no locations yet → this is the first
    await addLocation(form({ name: 'Main Office' })) // note: no isPrimary field submitted
    expect(insertedValues().isPrimary).toBe(1)
  })

  it('a later location is NOT primary unless the form opts in', async () => {
    existingRows = [{ id: 'loc_existing' }]
    await addLocation(form({ name: 'Second Office' }))
    expect(insertedValues().isPrimary).toBe(0)
  })

  it('a later location CAN be primary when the form opts in (and demotes others first)', async () => {
    existingRows = [{ id: 'loc_existing' }]
    await addLocation(form({ name: 'Second Office', isPrimary: 'on' }))
    expect(insertedValues().isPrimary).toBe(1)
    expect(ops.some((o) => o.kind === 'update')).toBe(true) // demote sweep ran
  })

  it('rejects a member (non owner/admin) before any write', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    await expect(addLocation(form({ name: 'X' }))).rejects.toThrow(/owner|admin/i)
    expect(ops).toHaveLength(0)
  })
})
