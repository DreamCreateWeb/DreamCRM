import { describe, it, expect, vi, beforeEach } from 'vitest'

let tenantCtx: {
  tenantType: 'platform' | 'clinic' | 'patient'
  patientId: string | null
} | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const updates: Array<Record<string, unknown>> = []

vi.mock('@/lib/db', async () => {
  const { patient } = await import('@/lib/db/schema/clinic')
  return {
    db: {
      update: (table: unknown) => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            if (table === patient) updates.push(vals)
          },
        }),
      }),
    },
  }
})

import { updateMyProfile } from '@/app/(default)/patient/profile/actions'

beforeEach(() => {
  updates.length = 0
  tenantCtx = { tenantType: 'patient', patientId: 'pat_1' }
})

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('updateMyProfile', () => {
  it('rejects non-patient tenants', async () => {
    tenantCtx = { tenantType: 'clinic', patientId: null }
    await expect(
      updateMyProfile(form({ firstName: 'A', lastName: 'B' })),
    ).rejects.toThrow(/patient/i)
  })

  it('rejects when patientId is missing', async () => {
    tenantCtx!.patientId = null
    await expect(
      updateMyProfile(form({ firstName: 'A', lastName: 'B' })),
    ).rejects.toThrow(/patient record/i)
  })

  it('requires firstName and lastName', async () => {
    await expect(updateMyProfile(form({ firstName: 'A' }))).rejects.toThrow(/name/i)
    await expect(updateMyProfile(form({ lastName: 'B' }))).rejects.toThrow(/name/i)
  })

  it('writes trimmed fields with null fallbacks for empty optionals', async () => {
    await updateMyProfile(
      form({
        firstName: '  Jane ',
        lastName: 'Doe',
        email: 'jane@x.com',
        phone: '',
        addressLine1: '123 Main',
      }),
    )
    expect(updates).toHaveLength(1)
    const u = updates[0]
    expect(u.firstName).toBe('Jane')
    expect(u.lastName).toBe('Doe')
    expect(u.email).toBe('jane@x.com')
    expect(u.phone).toBeNull()
    expect(u.addressLine1).toBe('123 Main')
  })
})
