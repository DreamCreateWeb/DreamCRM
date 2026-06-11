import { describe, it, expect, vi, beforeEach } from 'vitest'

const ctx = {
  tenantType: 'clinic' as 'clinic' | 'patient' | 'platform',
  organizationId: 'org_1',
  role: 'owner' as string,
  planTier: 'pro' as string,
}

const requirePlan = vi.fn(async () => undefined)
const updateSeoMeta = vi.fn(async () => ({}) as never)

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => ctx),
  requirePlan: (...a: unknown[]) => requirePlan(...(a as [])),
}))
vi.mock('@/lib/services/site-analytics', () => ({
  updateSeoMeta: (...a: unknown[]) => updateSeoMeta(...(a as [])),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveSeoMetaAction } from '@/app/(default)/settings/seo/actions'

beforeEach(() => {
  requirePlan.mockClear()
  updateSeoMeta.mockClear()
  ctx.tenantType = 'clinic'
  ctx.role = 'owner'
})

describe('saveSeoMetaAction gate', () => {
  it('saves for a clinic owner (Pro+ enforced via requirePlan)', async () => {
    const r = await saveSeoMetaAction({ home: { title: 'Hello' } })
    expect(r).toEqual({ ok: true })
    expect(requirePlan).toHaveBeenCalledWith(ctx, 'pro', 'seo')
    expect(updateSeoMeta).toHaveBeenCalledTimes(1)
    // The resolver sanitizes before the service is called.
    const [, meta] = updateSeoMeta.mock.calls[0] as [string, Record<string, unknown>]
    expect(meta.home).toEqual({ title: 'Hello' })
  })

  it('saves for a clinic admin', async () => {
    ctx.role = 'admin'
    const r = await saveSeoMetaAction({})
    expect(r).toEqual({ ok: true })
  })

  it('rejects a non-owner/admin role', async () => {
    ctx.role = 'member'
    const r = await saveSeoMetaAction({})
    expect(r).toEqual({ ok: false, error: expect.stringContaining('owners and admins') })
    expect(updateSeoMeta).not.toHaveBeenCalled()
  })

  it('rejects a non-clinic tenant', async () => {
    ctx.tenantType = 'platform'
    const r = await saveSeoMetaAction({})
    expect(r).toEqual({ ok: false, error: expect.stringContaining('Only clinics') })
    expect(updateSeoMeta).not.toHaveBeenCalled()
  })
})
