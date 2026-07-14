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
  // Loosely-typed (Promise<any>) so mockResolvedValue can return any outcome
  // shape these actions handle (deleted/refused, archived/refused, etc.).
  getPartnerLifecycleInfo: vi.fn(async (): Promise<any> => ({ hasMoneyHistory: false, accruedCents: 0, disposition: 'clean' })),
  deletePartner: vi.fn(async (): Promise<any> => ({ outcome: 'deleted', disposition: 'clean' })),
  archivePartner: vi.fn(async (): Promise<any> => ({ outcome: 'archived' })),
  reactivatePartner: vi.fn(async (): Promise<any> => ({ outcome: 'reactivated' })),
}))
vi.mock('@/lib/services/referrals', () => ({
  createPartner: svc.createPartner,
  resendPartnerInvite: vi.fn(),
  updatePartnerTerms: vi.fn(),
  setPartnerStatus: svc.setPartnerStatus,
  assignClinicReferral: svc.assignClinicReferral,
  updateClinicReferralTerms: vi.fn(),
  clearClinicReferral: vi.fn(),
  getPartnerLifecycleInfo: svc.getPartnerLifecycleInfo,
  deletePartner: svc.deletePartner,
  archivePartner: svc.archivePartner,
  reactivatePartner: svc.reactivatePartner,
}))
vi.mock('@/lib/services/referral-payouts', () => ({ payoutPartner: vi.fn(async () => ({ ok: true })) }))

import {
  createPartnerAction,
  setPartnerStatusAction,
  deletePartnerAction,
  archivePartnerAction,
  reactivatePartnerAction,
  getPartnerLifecycleAction,
} from '@/app/(default)/partners/admin-actions'
// Moved next to its only UI (the clinic-detail referral card).
import { assignClinicReferralAction } from '@/app/(default)/ecommerce/customers/[id]/actions'

beforeEach(() => {
  tenantCtx = null
  svc.createPartner.mockClear()
  svc.assignClinicReferral.mockClear()
  svc.getPartnerLifecycleInfo.mockClear()
  svc.deletePartner.mockClear()
  svc.archivePartner.mockClear()
  svc.reactivatePartner.mockClear()
  svc.deletePartner.mockResolvedValue({ outcome: 'deleted', disposition: 'clean' })
  svc.archivePartner.mockResolvedValue({ outcome: 'archived' })
  svc.reactivatePartner.mockResolvedValue({ outcome: 'reactivated' })
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

describe('lifecycle actions — gating + outcome shaping', () => {
  it('deletePartnerAction gates to platform admin', async () => {
    tenantCtx = { ...platformAdmin, tenantType: 'clinic', platformAdmin: false }
    await expect(deletePartnerAction('p1')).rejects.toThrow(/platform only/i)
    expect(svc.deletePartner).not.toHaveBeenCalled()
  })

  it('deletePartnerAction → { ok:true } on a clean hard delete', async () => {
    tenantCtx = platformAdmin
    svc.deletePartner.mockResolvedValue({ outcome: 'deleted', disposition: 'clean' })
    const r = await deletePartnerAction('p1')
    expect(r).toEqual({ ok: true, outcome: 'deleted' })
  })

  it('deletePartnerAction → requiresArchive when money history blocks the delete', async () => {
    tenantCtx = platformAdmin
    svc.deletePartner.mockResolvedValue({ outcome: 'refused', reason: 'has_history', disposition: 'archive' })
    const r = await deletePartnerAction('p1')
    expect(r).toEqual({ ok: false, requiresArchive: true, disposition: 'archive' })
  })

  it('archivePartnerAction gates to platform admin', async () => {
    tenantCtx = { ...platformAdmin, tenantType: 'clinic', platformAdmin: false }
    await expect(archivePartnerAction({ partnerId: 'p1' })).rejects.toThrow(/platform only/i)
  })

  it('archivePartnerAction passes the resolve choice + surfaces an outstanding balance', async () => {
    tenantCtx = platformAdmin
    svc.archivePartner.mockResolvedValue({ outcome: 'refused', reason: 'outstanding_balance', accruedCents: 4000 })
    const r = await archivePartnerAction({ partnerId: 'p1' })
    expect(r).toEqual({ ok: false, reason: 'outstanding_balance', accruedCents: 4000 })
    expect(svc.archivePartner).toHaveBeenCalledWith('p1', { resolve: undefined, initiatedBy: 'u1' })
  })

  it('archivePartnerAction forwards resolve:"void" and returns ok on archive', async () => {
    tenantCtx = platformAdmin
    svc.archivePartner.mockResolvedValue({ outcome: 'archived' })
    const r = await archivePartnerAction({ partnerId: 'p1', resolve: 'void' })
    expect(r).toEqual({ ok: true, outcome: 'archived' })
    expect(svc.archivePartner).toHaveBeenCalledWith('p1', { resolve: 'void', initiatedBy: 'u1' })
  })

  it('reactivatePartnerAction surfaces the email-conflict error', async () => {
    tenantCtx = platformAdmin
    svc.reactivatePartner.mockResolvedValue({ outcome: 'refused', reason: 'email_taken' })
    const r = await reactivatePartnerAction('p1')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/another active partner/i)
  })

  it('getPartnerLifecycleAction gates to platform admin', async () => {
    tenantCtx = { ...platformAdmin, tenantType: 'clinic', platformAdmin: false }
    await expect(getPartnerLifecycleAction('p1')).rejects.toThrow(/platform only/i)
  })
})
