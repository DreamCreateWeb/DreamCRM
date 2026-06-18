import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Connecting / disconnecting / reconfiguring the PMS triggers a PHI import and
 * must be owner/admin only — a clinic `member` (front desk) must NOT be able to
 * sever or re-point the integration. Regression: ensureClinicAdmin blocked only
 * patient + below-premium, letting a member through.
 */

type Ctx = {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  planTier: 'basic' | 'pro' | 'premium'
  organizationId: string
  userId: string
}
let ctx: Ctx

vi.mock('@/lib/auth/context', () => ({ requireTenant: vi.fn(async () => ctx) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { disconnectPms, setAutoSync } = vi.hoisted(() => ({
  disconnectPms: vi.fn().mockResolvedValue(undefined),
  setAutoSync: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/services/pms', () => ({
  connectOpenDental: vi.fn(),
  disconnectPms,
  runImport: vi.fn(),
  setAutoSync,
  setSyncDirection: vi.fn(),
}))

import { disconnectPmsAction, setAutoSyncAction } from '@/app/(default)/integrations/actions'

const clinic = (role: Ctx['role']): Ctx => ({
  tenantType: 'clinic',
  role,
  planTier: 'premium',
  organizationId: 'org_1',
  userId: 'u1',
})

beforeEach(() => vi.clearAllMocks())

describe('integrations actions — owner/admin only', () => {
  it('a member CANNOT disconnect the PMS', async () => {
    ctx = clinic('member')
    await expect(disconnectPmsAction()).rejects.toThrow(/owner or admin/i)
    expect(disconnectPms).not.toHaveBeenCalled()
  })

  it('a member CANNOT toggle auto-sync', async () => {
    ctx = clinic('member')
    await expect(setAutoSyncAction(true)).rejects.toThrow(/owner or admin/i)
    expect(setAutoSync).not.toHaveBeenCalled()
  })

  it('a patient CANNOT disconnect the PMS', async () => {
    ctx = clinic('patient')
    await expect(disconnectPmsAction()).rejects.toThrow()
    expect(disconnectPms).not.toHaveBeenCalled()
  })

  it('an admin CAN disconnect the PMS (gate passes)', async () => {
    ctx = clinic('admin')
    await disconnectPmsAction()
    expect(disconnectPms).toHaveBeenCalledWith('org_1')
  })

  it('an owner CAN toggle auto-sync', async () => {
    ctx = clinic('owner')
    await setAutoSyncAction(false)
    expect(setAutoSync).toHaveBeenCalledWith('org_1', false)
  })
})
