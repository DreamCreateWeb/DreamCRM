import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * After Phase-3 PR1, every Google Business surface is relaxed from Premium-only
 * to ALL plans (Basic included), with owner/admin still required. This verifies
 * the relaxed gates on:
 *  - the Integrations Zernio actions (syncZernioAccountsAction / disconnect…)
 *  - the Settings → "Sync from Google" actions (gbp-actions.ts)
 * A patient/member role or a non-clinic tenant must still be rejected.
 */

type Ctx = {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  planTier: 'basic' | 'pro' | 'premium'
  organizationId: string
  organizationSlug: string
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

// Integrations Zernio service (dynamically imported inside the actions).
const zernioSvc = vi.hoisted(() => ({
  syncConnectedAccounts: vi.fn().mockResolvedValue(undefined),
  disconnectPlatform: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/services/zernio', () => zernioSvc)

// PMS service is imported at module scope by the integrations actions — stub it
// so the import doesn't pull the real (server-only) module.
vi.mock('@/lib/services/pms', () => ({
  connectOpenDental: vi.fn(),
  disconnectPms: vi.fn(),
  runImport: vi.fn(),
  setAutoSync: vi.fn(),
  setSyncDirection: vi.fn(),
}))

// gbp-sync service used by the Settings gbp-actions.
const gbpSync = vi.hoisted(() => ({
  syncGoogleBusinessProfile: vi.fn().mockResolvedValue({ ok: true, applied: [], skippedManual: [], photoCount: 0 }),
  revertFieldToManual: vi.fn().mockResolvedValue({ ok: true }),
  importGooglePhotos: vi.fn().mockResolvedValue({ ok: true, added: 0 }),
}))
vi.mock('@/lib/services/gbp-sync', () => gbpSync)

import { syncZernioAccountsAction, disconnectZernioGoogleAction } from '@/app/(default)/integrations/actions'
import { syncFromGoogleAction } from '@/app/(default)/settings/clinic/gbp-actions'

beforeEach(() => {
  zernioSvc.syncConnectedAccounts.mockClear()
  zernioSvc.disconnectPlatform.mockClear()
  gbpSync.syncGoogleBusinessProfile.mockClear()
  tenantCtx = {
    tenantType: 'clinic',
    role: 'owner',
    planTier: 'basic',
    organizationId: 'org_1',
    organizationSlug: 'acme',
    userId: 'u1',
  }
})

describe('Integrations Zernio actions — relaxed to all plans', () => {
  it('syncZernioAccountsAction passes for a Basic-plan owner', async () => {
    const r = await syncZernioAccountsAction()
    expect(r.ok).toBe(true)
    expect(zernioSvc.syncConnectedAccounts).toHaveBeenCalledWith('org_1')
  })

  it('syncZernioAccountsAction passes for a Pro admin', async () => {
    tenantCtx!.planTier = 'pro'
    tenantCtx!.role = 'admin'
    const r = await syncZernioAccountsAction()
    expect(r.ok).toBe(true)
  })

  it('disconnectZernioGoogleAction passes for a Basic-plan owner', async () => {
    const r = await disconnectZernioGoogleAction()
    expect(r.ok).toBe(true)
    expect(zernioSvc.disconnectPlatform).toHaveBeenCalledWith('org_1', 'googlebusiness')
  })

  it('rejects a member role (returns error, never reaches the service)', async () => {
    tenantCtx!.role = 'member'
    const r = await syncZernioAccountsAction()
    expect(r.ok).toBe(false)
    expect(zernioSvc.syncConnectedAccounts).not.toHaveBeenCalled()
  })

  it('rejects a patient role', async () => {
    tenantCtx!.role = 'patient'
    const r = await disconnectZernioGoogleAction()
    expect(r.ok).toBe(false)
    expect(zernioSvc.disconnectPlatform).not.toHaveBeenCalled()
  })

  it('rejects a non-clinic tenant', async () => {
    tenantCtx!.tenantType = 'platform'
    const r = await syncZernioAccountsAction()
    expect(r.ok).toBe(false)
    expect(zernioSvc.syncConnectedAccounts).not.toHaveBeenCalled()
  })
})

describe('Settings "Sync from Google" actions — relaxed to all plans', () => {
  it('syncFromGoogleAction passes for a Basic-plan owner', async () => {
    const r = await syncFromGoogleAction()
    expect(r.ok).toBe(true)
    expect(gbpSync.syncGoogleBusinessProfile).toHaveBeenCalledWith('org_1', { force: true })
  })

  it('rejects a member role with a friendly error', async () => {
    tenantCtx!.role = 'member'
    const r = await syncFromGoogleAction()
    expect(r.ok).toBe(false)
    expect(gbpSync.syncGoogleBusinessProfile).not.toHaveBeenCalled()
  })

  it('rejects a non-clinic tenant', async () => {
    tenantCtx!.tenantType = 'platform'
    const r = await syncFromGoogleAction()
    expect(r.ok).toBe(false)
  })
})
