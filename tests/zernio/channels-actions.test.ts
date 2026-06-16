import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Channel connect/disconnect server actions — now consolidated into the
 * Integrations module (the /channels surface folded into /integrations). Clinic +
 * owner/admin on ANY plan (GBP free; the per-platform social cap is enforced in
 * the connect ROUTE, so refresh/disconnect here are never cap-gated). Off-list
 * platforms are rejected defensively. `{ ok | error }` shape.
 */

type Ctx = {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  planTier: 'basic' | 'pro' | 'premium'
  organizationId: string
  userId: string
}
let tenantCtx: Ctx | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const zernioSvc = vi.hoisted(() => ({
  syncConnectedAccounts: vi.fn().mockResolvedValue(undefined),
  disconnectPlatform: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/services/zernio', () => zernioSvc)
// The integrations actions also import the PMS service (other actions in the
// file). Stub it so importing the module doesn't pull the real DB layer.
vi.mock('@/lib/services/pms', () => ({
  connectOpenDental: vi.fn(),
  disconnectPms: vi.fn(),
  runImport: vi.fn(),
  setAutoSync: vi.fn(),
  setSyncDirection: vi.fn(),
}))
vi.mock('@/lib/services/social-billing', () => ({
  addSocialAddon: vi.fn(),
  removeSocialAddon: vi.fn(),
}))

import { refreshChannelsAction, disconnectChannelAction } from '@/app/(default)/integrations/actions'

beforeEach(() => {
  zernioSvc.syncConnectedAccounts.mockClear()
  zernioSvc.disconnectPlatform.mockClear()
  tenantCtx = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', userId: 'u1' }
})

describe('refreshChannelsAction', () => {
  it('re-syncs all accounts for a clinic owner', async () => {
    const r = await refreshChannelsAction()
    expect(r.ok).toBe(true)
    expect(zernioSvc.syncConnectedAccounts).toHaveBeenCalledWith('org_1')
  })

  it('passes for a Basic-plan admin (GBP is free; refresh never cap-gated)', async () => {
    tenantCtx!.planTier = 'basic'
    tenantCtx!.role = 'admin'
    const r = await refreshChannelsAction()
    expect(r.ok).toBe(true)
  })

  it('rejects a member role', async () => {
    tenantCtx!.role = 'member'
    const r = await refreshChannelsAction()
    expect(r.ok).toBe(false)
    expect(zernioSvc.syncConnectedAccounts).not.toHaveBeenCalled()
  })

  it('rejects a non-clinic tenant', async () => {
    tenantCtx!.tenantType = 'platform'
    const r = await refreshChannelsAction()
    expect(r.ok).toBe(false)
    expect(zernioSvc.syncConnectedAccounts).not.toHaveBeenCalled()
  })

  it('surfaces a service error as { ok: false }', async () => {
    zernioSvc.syncConnectedAccounts.mockRejectedValueOnce(new Error('boom'))
    const r = await refreshChannelsAction()
    expect(r.ok).toBe(false)
    expect(r.error).toContain('boom')
  })
})

describe('disconnectChannelAction', () => {
  it('disconnects Google Business', async () => {
    const r = await disconnectChannelAction('googlebusiness')
    expect(r.ok).toBe(true)
    expect(zernioSvc.disconnectPlatform).toHaveBeenCalledWith('org_1', 'googlebusiness')
  })

  it.each(['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'])('disconnects %s', async (platform) => {
    const r = await disconnectChannelAction(platform)
    expect(r.ok).toBe(true)
    expect(zernioSvc.disconnectPlatform).toHaveBeenCalledWith('org_1', platform)
  })

  it('rejects an off-shortlist platform without calling the service', async () => {
    const r = await disconnectChannelAction('x')
    expect(r.ok).toBe(false)
    expect(zernioSvc.disconnectPlatform).not.toHaveBeenCalled()
  })

  it('rejects a member role', async () => {
    tenantCtx!.role = 'member'
    const r = await disconnectChannelAction('instagram')
    expect(r.ok).toBe(false)
    expect(zernioSvc.disconnectPlatform).not.toHaveBeenCalled()
  })

  it('rejects a non-clinic tenant', async () => {
    tenantCtx!.tenantType = 'platform'
    const r = await disconnectChannelAction('googlebusiness')
    expect(r.ok).toBe(false)
  })
})

describe('disconnectZernioGoogleAction (GBP wrapper)', () => {
  it('disconnects Google Business via the thin wrapper', async () => {
    const { disconnectZernioGoogleAction } = await import('@/app/(default)/integrations/actions')
    const r = await disconnectZernioGoogleAction()
    expect(r.ok).toBe(true)
    expect(zernioSvc.disconnectPlatform).toHaveBeenCalledWith('org_1', 'googlebusiness')
  })
})

describe('social add-on actions (consolidated into Integrations)', () => {
  it('buySocialAddonAction adds the add-on for a clinic owner', async () => {
    const billing = await import('@/lib/services/social-billing')
    const { buySocialAddonAction } = await import('@/app/(default)/integrations/actions')
    const r = await buySocialAddonAction()
    expect(r.ok).toBe(true)
    expect(billing.addSocialAddon).toHaveBeenCalledWith('org_1')
  })

  it('cancelSocialAddonAction removes the add-on for a clinic admin', async () => {
    tenantCtx!.role = 'admin'
    const billing = await import('@/lib/services/social-billing')
    const { cancelSocialAddonAction } = await import('@/app/(default)/integrations/actions')
    const r = await cancelSocialAddonAction()
    expect(r.ok).toBe(true)
    expect(billing.removeSocialAddon).toHaveBeenCalledWith('org_1')
  })

  it('buySocialAddonAction rejects a member role', async () => {
    tenantCtx!.role = 'member'
    const billing = await import('@/lib/services/social-billing')
    const { buySocialAddonAction } = await import('@/app/(default)/integrations/actions')
    const r = await buySocialAddonAction()
    expect(r.ok).toBe(false)
    expect(billing.addSocialAddon).not.toHaveBeenCalled()
  })
})
