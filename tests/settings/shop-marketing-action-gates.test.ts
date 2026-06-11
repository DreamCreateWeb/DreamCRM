import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Premium-tier server-action gates for Shop + Recall & Outreach (marketing).
 * A below-tier clinic must NOT be able to fire these even by deep-linking the
 * page; demo contexts (which inherit the demo org's premium tier) must pass;
 * platform tenants on the SaaS-side marketing surface are not plan-gated.
 */
type Ctx = {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  planTier: 'basic' | 'pro' | 'premium'
  organizationId: string
  userId: string
}
let tenantCtx: Ctx

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => tenantCtx),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const { saveProduct, savePlan, createCoupon, createAudience } = vi.hoisted(() => ({
  saveProduct: vi.fn().mockResolvedValue('prod_1'),
  savePlan: vi.fn().mockResolvedValue('plan_1'),
  createCoupon: vi.fn().mockResolvedValue(undefined),
  createAudience: vi.fn().mockResolvedValue({ id: 'aud_1' }),
}))

vi.mock('@/lib/services/shop', () => ({
  saveProduct,
  setProductStatus: vi.fn(),
  deleteProduct: vi.fn(),
  updateShopConfig: vi.fn(),
  setOrderFulfillment: vi.fn(),
}))
vi.mock('@/lib/services/shop-connect', () => ({ disconnectShopStripe: vi.fn() }))
vi.mock('@/lib/services/membership', () => ({
  savePlan,
  setPlanStatus: vi.fn(),
  deletePlan: vi.fn(),
  markBenefitUsed: vi.fn(),
}))
vi.mock('@/lib/services/coupons', () => ({
  createCoupon,
  deactivateCoupon: vi.fn(),
  generateBirthdayCoupons: vi.fn(),
}))
// marketing/actions has a wide import surface — stub everything it pulls in.
vi.mock('@/lib/services/marketing', () => ({
  AudienceInput: { parse: (v: unknown) => v },
  LeadInput: { parse: (v: unknown) => v },
  LeadUpdate: { parse: (v: unknown) => v },
  PatientAudienceFilter: {},
  archiveLead: vi.fn(),
  createAudience,
  createLead: vi.fn(),
  deleteAudience: vi.fn(),
  moveLead: vi.fn(),
  resolveAudience: vi.fn(),
  setOptedOut: vi.fn(),
  updateAudience: vi.fn(),
  updateLead: vi.fn(),
}))
vi.mock('@/lib/services/marketing-campaigns', () => ({
  CampaignInput: { parse: (v: unknown) => v },
  CampaignUpdate: { parse: (v: unknown) => v },
  cancelScheduledCampaign: vi.fn(),
  createMarketingCampaign: vi.fn(),
  deleteMarketingCampaign: vi.fn(),
  scheduleCampaign: vi.fn(),
  updateMarketingCampaign: vi.fn(),
}))
vi.mock('@/lib/services/marketing-send', () => ({ sendCampaign: vi.fn() }))
vi.mock('@/lib/services/ai-marketing', () => ({ draftCampaign: vi.fn(), improveCopy: vi.fn() }))

import { saveProductAction } from '@/app/(default)/shop/actions'
import { savePlanAction } from '@/app/(default)/shop/memberships/actions'
import { createCouponAction } from '@/app/(default)/shop/coupons/actions'
import { createAudienceAction } from '@/app/(default)/marketing/actions'

const product = { name: 'Whitening Kit', variants: [{ name: 'Standard' }] } as never
const plan = { name: 'Smile Club', priceDollars: 39 } as never
const coupon = { code: 'WELCOME10', discountType: 'percent' as const, value: 10, singleUse: false }
const audience = { name: 'Recall due', recipientSource: 'patients' } as never

beforeEach(() => {
  saveProduct.mockClear()
  savePlan.mockClear()
  createCoupon.mockClear()
  createAudience.mockClear()
  tenantCtx = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', userId: 'u1' }
})

describe('shop actions — premium gate', () => {
  it('saves a product for a premium clinic', async () => {
    await saveProductAction(product)
    expect(saveProduct).toHaveBeenCalledTimes(1)
  })
  it('rejects a basic clinic before touching the service', async () => {
    tenantCtx.planTier = 'basic'
    await expect(saveProductAction(product)).rejects.toThrow(/Premium plan/i)
    expect(saveProduct).not.toHaveBeenCalled()
  })
  it('rejects a pro clinic (shop is premium)', async () => {
    tenantCtx.planTier = 'pro'
    await expect(savePlanAction(plan)).rejects.toThrow(/Premium plan/i)
    expect(savePlan).not.toHaveBeenCalled()
  })
  it('gates coupons too', async () => {
    tenantCtx.planTier = 'basic'
    await expect(createCouponAction(coupon)).rejects.toThrow(/Premium plan/i)
    expect(createCoupon).not.toHaveBeenCalled()
  })
})

describe('marketing (Recall & Outreach) actions — premium gate', () => {
  it('runs for a premium clinic', async () => {
    await createAudienceAction(audience)
    expect(createAudience).toHaveBeenCalledTimes(1)
  })
  it('rejects a basic clinic', async () => {
    tenantCtx.planTier = 'basic'
    await expect(createAudienceAction(audience)).rejects.toThrow(/Premium plan/i)
    expect(createAudience).not.toHaveBeenCalled()
  })
  it('allows a platform tenant regardless of tier (SaaS-side marketing)', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', planTier: 'basic', organizationId: 'org_p', userId: 'u1' }
    await createAudienceAction(audience)
    expect(createAudience).toHaveBeenCalledTimes(1)
  })
})
