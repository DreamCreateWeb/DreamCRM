import { describe, it, expect, vi, beforeEach } from 'vitest'

let tenantCtx: {
  tenantType: 'platform' | 'clinic' | 'patient' | 'partner'
  organizationId: string
  platformAdmin: boolean
  userId: string
  userName: string
  role: 'owner' | 'admin' | 'member' | 'patient'
} | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const svc = vi.hoisted(() => ({
  createPartner: vi.fn(async () => ({ id: 'p1', email: 'p@x.com' })),
  setPartnerStatus: vi.fn(async () => undefined),
  assignClinicReferral: vi.fn(async () => undefined),
}))
vi.mock('@/lib/services/referrals', () => ({
  createPartner: svc.createPartner,
  resendPartnerInvite: vi.fn(),
  updatePartnerTerms: vi.fn(),
  setPartnerStatus: svc.setPartnerStatus,
  assignClinicReferral: svc.assignClinicReferral,
  updateClinicReferralTerms: vi.fn(),
  clearClinicReferral: vi.fn(),
}))
vi.mock('@/lib/services/referral-payouts', () => ({ payoutPartner: vi.fn(async () => ({ ok: true })) }))

import {
  createPartnerAction,
  setPartnerStatusAction,
  assignClinicReferralAction,
} from '@/app/(default)/partners/admin-actions'

beforeEach(() => {
  tenantCtx = null
  svc.createPartner.mockClear()
  svc.assignClinicReferral.mockClear()
})

const platformAdmin = {
  tenantType: 'platform' as const,
  organizationId: 'plat',
  platformAdmin: true,
  userId: 'u1',
  userName: 'Admin',
  role: 'owner' as const,
}

describe('partner admin-actions gating', () => {
  it('rejects a clinic tenant', async () => {
    tenantCtx = { ...platformAdmin, tenantType: 'clinic', platformAdmin: false }
    await expect(
      createPartnerAction({ name: 'X', email: 'x@y.com', defaultPercentBps: 1000 }),
    ).rejects.toThrow(/platform only/i)
    expect(svc.createPartner).not.toHaveBeenCalled()
  })

  it('rejects a platform MEMBER (non owner/admin)', async () => {
    tenantCtx = { ...platformAdmin, role: 'member' }
    await expect(
      createPartnerAction({ name: 'X', email: 'x@y.com', defaultPercentBps: 1000 }),
    ).rejects.toThrow(/owner or admin/i)
  })

  it('allows a platform owner to create a partner', async () => {
    tenantCtx = platformAdmin
    const r = await createPartnerAction({ name: 'X', email: 'x@y.com', defaultPercentBps: 1000 })
    expect(r).toEqual({ id: 'p1', email: 'p@x.com' })
    expect(svc.createPartner).toHaveBeenCalledOnce()
  })

  it('validates input (bad percent) before calling the service', async () => {
    tenantCtx = platformAdmin
    await expect(
      createPartnerAction({ name: 'X', email: 'x@y.com', defaultPercentBps: 99999 }),
    ).rejects.toThrow()
    expect(svc.createPartner).not.toHaveBeenCalled()
  })

  it('setPartnerStatusAction gates to platform admin', async () => {
    tenantCtx = { ...platformAdmin, tenantType: 'clinic', platformAdmin: false }
    await expect(setPartnerStatusAction('p1', 'suspended')).rejects.toThrow(/platform only/i)
  })

  it('assignClinicReferralAction passes through to the service for a platform admin', async () => {
    tenantCtx = platformAdmin
    await assignClinicReferralAction({ organizationId: 'org1', partnerId: 'p1', percentBps: 1500 })
    expect(svc.assignClinicReferral).toHaveBeenCalledWith('org1', 'p1', 1500, undefined)
  })
})
