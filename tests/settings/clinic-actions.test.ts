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

const ops: Array<{ kind: 'insert' | 'update'; table: string; values: unknown }> = []

vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const { organization } = await import('@/lib/db/schema/auth')
  const name = (t: unknown) =>
    t === clinicProfile ? 'clinic_profile' : t === organization ? 'organization' : 'unknown'
  return {
    db: {
      insert: (table: unknown) => ({
        values: (v: unknown) => ({
          onConflictDoUpdate: async ({ set }: { set: unknown }) => {
            ops.push({ kind: 'insert', table: name(table), values: { values: v, set } })
          },
        }),
      }),
      update: (table: unknown) => ({
        set: (v: unknown) => ({
          where: async () => {
            ops.push({ kind: 'update', table: name(table), values: v })
          },
        }),
      }),
    },
  }
})

import { updateClinicProfile } from '@/app/(default)/settings/clinic/actions'

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

describe('updateClinicProfile', () => {
  it('rejects when tenant is not a clinic', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', organizationId: 'org_p', organizationSlug: 'dream' }
    await expect(updateClinicProfile(form({ displayName: 'X' }))).rejects.toThrow(/clinic/i)
  })

  it('rejects when role is member', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    await expect(updateClinicProfile(form({ displayName: 'X' }))).rejects.toThrow(/owner|admin/i)
  })

  it('writes clinic_profile row with sanitized fields', async () => {
    await updateClinicProfile(
      form({
        displayName: '  Test Dental  ',
        tagline: 'Caring smiles',
        phone: '555',
        email: 'hi@x.com',
        city: 'Austin',
        state: 'TX',
      }),
    )
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    expect(insertOp).toBeDefined()
    const set = (insertOp.values as { set: Record<string, unknown> }).set
    expect(set.displayName).toBe('Test Dental') // trimmed
    expect(set.tagline).toBe('Caring smiles')
    expect(set.country).toBe('US') // default
  })

  it('updates organization.name when displayName provided', async () => {
    await updateClinicProfile(form({ displayName: 'Acme Dental' }))
    const orgUpdate = ops.find((o) => o.kind === 'update' && o.table === 'organization')
    expect(orgUpdate).toBeDefined()
    expect((orgUpdate!.values as { name: string }).name).toBe('Acme Dental')
  })

  it('persists hours map when provided', async () => {
    const fd = form({ displayName: 'X' })
    fd.set('hours[mon].open', '09:00')
    fd.set('hours[mon].close', '17:00')
    fd.set('hours[sun].closed', 'on')
    await updateClinicProfile(fd)
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as {
      set: { hours: Record<string, { open?: string; close?: string; closed?: boolean }> }
    }).set
    expect(set.hours.mon.open).toBe('09:00')
    expect(set.hours.mon.close).toBe('17:00')
    expect(set.hours.sun.closed).toBe(true)
  })

  it('rejects invalid hour formats', async () => {
    const fd = form({ displayName: 'X' })
    fd.set('hours[mon].open', '9am')
    await expect(updateClinicProfile(fd)).rejects.toThrow(/Invalid open time/i)
  })

  it('stores null hours when no day was edited', async () => {
    await updateClinicProfile(form({ displayName: 'X' }))
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as { set: { hours: unknown } }).set
    expect(set.hours).toBeNull()
  })

  it('marks "closed" without requiring time fields', async () => {
    const fd = form({ displayName: 'X' })
    fd.set('hours[sat].closed', 'on')
    await updateClinicProfile(fd)
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as { set: { hours: Record<string, { closed?: boolean }> } }).set
    expect(set.hours.sat.closed).toBe(true)
  })
})
