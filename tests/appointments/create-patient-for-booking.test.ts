import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * createPatientForBookingAction — the New-booking drawer's "New caller" door.
 * Role-checked, org-scoped, family-safe (resolvePublicPatient), E.164 or null.
 */
let tenantCtx: { tenantType: string; role: string; organizationId: string } | null = null
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const resolveCalls: Array<{ org: string; input: Record<string, unknown> }> = []
let resolution = { patientId: 'p_new', created: true, sharedContactWith: null as null | { id: string; name: string } }
vi.mock('@/lib/services/public-patient-match', () => ({
  resolvePublicPatient: vi.fn(async (org: string, input: Record<string, unknown>) => {
    resolveCalls.push({ org, input })
    return resolution
  }),
}))
const optionCalls: Array<[string, string]> = []
vi.mock('@/lib/services/patients', () => ({
  searchPatientOptions: vi.fn(),
  getPatientOption: vi.fn(async (org: string, id: string) => {
    optionCalls.push([org, id])
    return { id, name: 'Dana Park', hint: null }
  }),
}))

import { createPatientForBookingAction } from '@/app/(default)/appointments/actions'

beforeEach(() => {
  tenantCtx = { tenantType: 'clinic', role: 'member', organizationId: 'org_a' }
  resolveCalls.length = 0
  optionCalls.length = 0
  resolution = { patientId: 'p_new', created: true, sharedContactWith: null }
})

describe('createPatientForBookingAction', () => {
  it('creates through the family-safe resolver, org-scoped, phone as E.164, provenance manual', async () => {
    const r = await createPatientForBookingAction({ firstName: ' Dana ', lastName: 'Park', phone: '(512) 555-0142', email: '' })
    expect(r).toMatchObject({ ok: true, existing: false, sharedContactWith: null, option: { id: 'p_new' } })
    expect(resolveCalls).toEqual([
      { org: 'org_a', input: { firstName: 'Dana', lastName: 'Park', email: null, phone: '+15125550142', source: 'manual', lifecycle: 'new' } },
    ])
    expect(optionCalls).toEqual([['org_a', 'p_new']])
  })

  it('reports an exact match as the existing patient', async () => {
    resolution = { patientId: 'p_old', created: false, sharedContactWith: null }
    const r = await createPatientForBookingAction({ firstName: 'Dana', lastName: 'Park', phone: '5125550142' })
    expect(r).toMatchObject({ ok: true, existing: true })
  })

  it('surfaces a likely-family mint', async () => {
    resolution = { patientId: 'p_kid', created: true, sharedContactWith: { id: 'p_mom', name: 'Lee Park' } }
    const r = await createPatientForBookingAction({ firstName: 'Dana', lastName: 'Park', email: 'Lee@Example.com' })
    expect(r).toMatchObject({ ok: true, existing: false, sharedContactWith: { name: 'Lee Park' } })
    expect(resolveCalls[0].input.email).toBe('lee@example.com')
  })

  it('honest-null: an unparseable phone is refused, never stored as junk', async () => {
    const r = await createPatientForBookingAction({ firstName: 'Dana', lastName: 'Park', phone: '12ab' })
    expect(r.ok).toBe(false)
    expect(resolveCalls).toHaveLength(0)
  })

  it('needs a name and a way to reach them', async () => {
    expect((await createPatientForBookingAction({ firstName: 'Dana', lastName: '', phone: '5125550142' })).ok).toBe(false)
    expect((await createPatientForBookingAction({ firstName: 'Dana', lastName: 'Park' })).ok).toBe(false)
    expect(resolveCalls).toHaveLength(0)
  })

  it('refuses a non-clinic tenant', async () => {
    tenantCtx = { tenantType: 'patient', role: 'patient', organizationId: 'org_a' }
    await expect(createPatientForBookingAction({ firstName: 'D', lastName: 'P', phone: '5125550142' })).rejects.toThrow()
  })
})
