import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * createProviderAction / updateProviderAction server-side validation — the
 * Settings → Practice providers tab. The action layer must:
 *  - block an empty name,
 *  - reject a malformed email (but allow a blank one — email is optional),
 *  - reject a name that collides with an existing ACTIVE provider (case-insensitive),
 *  - stay owner/admin + clinic gated.
 * These guard against a bad client bypassing the browser checks.
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

// Existing providers the collision check reads. Default: one active "Dr. Reyes".
let providerRows: Array<{ id: string; displayName: string; role: string; email: string | null; isActive: boolean }> = []
const createSpy = vi.fn(async () => 'prov_new')
const updateSpy = vi.fn(async () => {})
const deactivateSpy = vi.fn(async () => {})

vi.mock('@/lib/services/providers', () => ({
  listProviders: vi.fn(async () => providerRows),
  createProvider: (...args: unknown[]) => createSpy(...(args as [])),
  updateProvider: (...args: unknown[]) => updateSpy(...(args as [])),
  deactivateProvider: (...args: unknown[]) => deactivateSpy(...(args as [])),
}))

// db + booking are imported by actions.ts but unused on these paths.
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }), update: () => ({ set: () => ({ where: async () => {} }) }) },
}))
vi.mock('@/lib/services/booking', () => ({ normalizeChairCount: (n: number) => n }))

import { createProviderAction, updateProviderAction } from '@/app/(default)/settings/practice/actions'

beforeEach(() => {
  createSpy.mockClear()
  updateSpy.mockClear()
  deactivateSpy.mockClear()
  tenantCtx = { tenantType: 'clinic', role: 'owner', organizationId: 'org_1', organizationSlug: 'acme' }
  providerRows = [{ id: 'prov_1', displayName: 'Dr. Reyes', role: 'dentist', email: null, isActive: true }]
})

describe('createProviderAction validation', () => {
  it('blocks an empty / whitespace name', async () => {
    const r = await createProviderAction({ displayName: '   ' })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/name/i) })
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('rejects a malformed email', async () => {
    const r = await createProviderAction({ displayName: 'Dr. New', email: 'not-an-email' })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/email/i) })
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('allows a blank email (optional field)', async () => {
    const r = await createProviderAction({ displayName: 'Dr. New', email: '' })
    expect(r).toEqual({ ok: true })
    expect(createSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects a duplicate active name (case-insensitive)', async () => {
    const r = await createProviderAction({ displayName: '  dr. reyes ' })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/already exists/i) })
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('allows re-adding a name that only exists on an INACTIVE provider', async () => {
    providerRows = [{ id: 'prov_1', displayName: 'Dr. Reyes', role: 'dentist', email: null, isActive: false }]
    const r = await createProviderAction({ displayName: 'Dr. Reyes' })
    expect(r).toEqual({ ok: true })
    expect(createSpy).toHaveBeenCalledTimes(1)
  })

  it('accepts a valid new provider with a good email', async () => {
    const r = await createProviderAction({ displayName: 'Dr. Vega', role: 'hygienist', email: 'vega@clinic.com' })
    expect(r).toEqual({ ok: true })
    expect(createSpy).toHaveBeenCalledTimes(1)
  })

  it('is blocked for a non-owner/admin member', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    await expect(createProviderAction({ displayName: 'Dr. New' })).rejects.toThrow(/owner|admin/i)
  })

  it('is blocked for a non-clinic tenant', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', organizationId: 'p', organizationSlug: 'dc' }
    await expect(createProviderAction({ displayName: 'Dr. New' })).rejects.toThrow(/clinic/i)
  })
})

describe('updateProviderAction validation', () => {
  it('blocks renaming to an empty name', async () => {
    const r = await updateProviderAction({ providerId: 'prov_1', displayName: '  ' })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/name/i) })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('rejects a malformed email on update', async () => {
    const r = await updateProviderAction({ providerId: 'prov_1', email: 'bad@' })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/email/i) })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('does NOT treat a row renaming to its OWN name as a duplicate', async () => {
    // prov_1 is "Dr. Reyes"; saving it as "Dr. Reyes" (unchanged) must pass.
    const r = await updateProviderAction({ providerId: 'prov_1', displayName: 'Dr. Reyes' })
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects renaming to ANOTHER active provider’s name', async () => {
    providerRows = [
      { id: 'prov_1', displayName: 'Dr. Reyes', role: 'dentist', email: null, isActive: true },
      { id: 'prov_2', displayName: 'Dr. Vega', role: 'hygienist', email: null, isActive: true },
    ]
    const r = await updateProviderAction({ providerId: 'prov_1', displayName: 'Dr. Vega' })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/already exists/i) })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('allows toggling active without touching name/email (no dup check)', async () => {
    const r = await updateProviderAction({ providerId: 'prov_1', isActive: false })
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledTimes(1)
  })
})
