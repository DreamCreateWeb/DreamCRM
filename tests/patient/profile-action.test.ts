import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Portal profile actions: updateMyProfileAction (returns {ok} results
 * instead of throwing) and setMarketingEmailOptInAction (patient-controlled
 * comms preference with opt-in/out audit timestamps).
 */

let tenantCtx: {
  tenantType: 'platform' | 'clinic' | 'patient'
  patientId: string | null
  organizationId: string
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

import { updateMyProfileAction, setMarketingEmailOptInAction } from '@/app/(portal)/patient/profile/actions'

beforeEach(() => {
  updates.length = 0
  tenantCtx = { tenantType: 'patient', patientId: 'pat_1', organizationId: 'org_1' }
})

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('updateMyProfileAction', () => {
  it('rejects non-patient tenants', async () => {
    tenantCtx = { tenantType: 'clinic', patientId: null, organizationId: 'org_1' }
    const r = await updateMyProfileAction(form({ firstName: 'A', lastName: 'B' }))
    expect(r).toMatchObject({ ok: false })
    expect(updates).toHaveLength(0)
  })

  it('rejects when patientId is missing', async () => {
    tenantCtx!.patientId = null
    const r = await updateMyProfileAction(form({ firstName: 'A', lastName: 'B' }))
    expect(r).toMatchObject({ ok: false })
    expect(updates).toHaveLength(0)
  })

  it('requires firstName and lastName', async () => {
    const r1 = await updateMyProfileAction(form({ firstName: 'A' }))
    expect(r1).toMatchObject({ ok: false })
    const r2 = await updateMyProfileAction(form({ lastName: 'B' }))
    expect(r2).toMatchObject({ ok: false })
    expect(updates).toHaveLength(0)
  })

  it('writes trimmed fields with null fallbacks for empty optionals', async () => {
    const r = await updateMyProfileAction(
      form({
        firstName: '  Jane ',
        lastName: 'Doe',
        email: 'jane@x.com',
        phone: '',
        addressLine1: '123 Main',
      }),
    )
    expect(r).toEqual({ ok: true })
    expect(updates).toHaveLength(1)
    const u = updates[0]
    expect(u.firstName).toBe('Jane')
    expect(u.lastName).toBe('Doe')
    expect(u.email).toBe('jane@x.com')
    expect(u.phone).toBeNull()
    expect(u.addressLine1).toBe('123 Main')
  })
})

describe('setMarketingEmailOptInAction', () => {
  it('rejects non-patient tenants', async () => {
    tenantCtx = { tenantType: 'clinic', patientId: null, organizationId: 'org_1' }
    const r = await setMarketingEmailOptInAction(false)
    expect(r).toMatchObject({ ok: false })
    expect(updates).toHaveLength(0)
  })

  it('opting in sets the flag + opt-in timestamp + portal source', async () => {
    const r = await setMarketingEmailOptInAction(true)
    expect(r).toEqual({ ok: true })
    const u = updates[0]
    expect(u.marketingEmailOptIn).toBe(1)
    expect(u.marketingEmailOptInAt).toBeInstanceOf(Date)
    expect(u.marketingOptInSource).toBe('portal')
  })

  it('opting out sets the flag + opt-out timestamp', async () => {
    const r = await setMarketingEmailOptInAction(false)
    expect(r).toEqual({ ok: true })
    const u = updates[0]
    expect(u.marketingEmailOptIn).toBe(0)
    expect(u.marketingEmailOptOutAt).toBeInstanceOf(Date)
  })
})
