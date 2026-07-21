import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase-3 fold guard: the clinic's campaign home is the Outreach hub. A
 * clinic hitting the old /growth/campaigns list redirects there WITH its
 * prefill params (a queue CTA from a stale page still lands pre-targeted);
 * the platform tenant keeps the standalone list. The /growth/campaigns/[id]
 * editor is untouched for both tenants.
 */

const requireTenant = vi.fn()
vi.mock('@/lib/auth/context', () => ({ requireTenant: () => requireTenant() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/services/marketing-campaigns', () => ({
  listMarketingCampaigns: vi.fn(async () => []),
}))
vi.mock('@/lib/services/marketing', () => ({
  listAudiences: vi.fn(async () => []),
}))

import CampaignsPage from '@/app/(default)/growth/campaigns/page'

function sp(params: Record<string, string> = {}) {
  return { searchParams: Promise.resolve(params) }
}

beforeEach(() => requireTenant.mockReset())

describe('/growth/campaigns after the fold', () => {
  it('redirects a clinic to the Outreach hub', async () => {
    requireTenant.mockResolvedValue({ tenantType: 'clinic', organizationId: 'org_c', planTier: 'premium', role: 'owner' })
    await expect(CampaignsPage(sp())).rejects.toThrow('REDIRECT:/growth/outreach')
  })

  it('forwards prefill params so a stale queue CTA still lands pre-targeted', async () => {
    requireTenant.mockResolvedValue({ tenantType: 'clinic', organizationId: 'org_c', planTier: 'premium', role: 'owner' })
    await expect(CampaignsPage(sp({ prefill_audience: '42', prefill_template: '9' }))).rejects.toThrow(
      'REDIRECT:/growth/outreach?prefill_audience=42&prefill_template=9',
    )
  })

  it('keeps the standalone list for the platform tenant', async () => {
    requireTenant.mockResolvedValue({ tenantType: 'platform', organizationId: 'org_p', planTier: null, role: 'owner' })
    const ui = await CampaignsPage(sp())
    expect(ui).toBeTruthy() // rendered, no redirect thrown
  })
})
