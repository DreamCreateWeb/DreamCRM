import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Settings → Billing social add-on server actions (buy / cancel): owner/admin +
 * clinic gating, delegation to the service, and the `{ ok | error }` convention.
 */

type Ctx = {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  organizationId: string
}
let tenantCtx: Ctx | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// requireUser is imported at module scope by settings/actions.ts.
vi.mock('@/lib/session', () => ({ requireUser: vi.fn() }))

const svc = vi.hoisted(() => ({
  addSocialAddon: vi.fn().mockResolvedValue(undefined),
  removeSocialAddon: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/services/social-billing', () => svc)

// settings/actions.ts imports billing + settings services at module scope.
vi.mock('@/lib/services/billing', () => ({
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
}))
vi.mock('@/lib/services/settings', () => ({
  AccountInput: { parse: (x: unknown) => x },
  BillingInput: { parse: (x: unknown) => x },
  BillingPlan: { parse: (x: unknown) => x },
  FeedbackInput: { parse: (x: unknown) => x },
  NotificationPrefsInput: { parse: (x: unknown) => x },
  submitFeedback: vi.fn(),
  updateAccount: vi.fn(),
  upsertBilling: vi.fn(),
  upsertNotificationPrefs: vi.fn(),
}))

import { buySocialAddonAction, cancelSocialAddonAction } from '@/app/(default)/settings/actions'

beforeEach(() => {
  svc.addSocialAddon.mockClear()
  svc.removeSocialAddon.mockClear()
  tenantCtx = { tenantType: 'clinic', role: 'owner', organizationId: 'org_1' }
})

describe('buySocialAddonAction', () => {
  it('passes for a clinic owner and calls the service', async () => {
    const r = await buySocialAddonAction()
    expect(r.ok).toBe(true)
    expect(svc.addSocialAddon).toHaveBeenCalledWith('org_1')
  })

  it('passes for a clinic admin', async () => {
    tenantCtx!.role = 'admin'
    const r = await buySocialAddonAction()
    expect(r.ok).toBe(true)
  })

  it('blocks a member role', async () => {
    tenantCtx!.role = 'member'
    const r = await buySocialAddonAction()
    expect(r.ok).toBe(false)
    expect(svc.addSocialAddon).not.toHaveBeenCalled()
  })

  it('blocks a non-clinic tenant', async () => {
    tenantCtx!.tenantType = 'platform'
    const r = await buySocialAddonAction()
    expect(r.ok).toBe(false)
    expect(svc.addSocialAddon).not.toHaveBeenCalled()
  })

  it('surfaces the service error verbatim (e.g. Upgrade to Pro)', async () => {
    svc.addSocialAddon.mockRejectedValueOnce(new Error('Upgrade to Pro to add social connections.'))
    const r = await buySocialAddonAction()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Upgrade to Pro/i)
  })
})

describe('cancelSocialAddonAction', () => {
  it('passes for a clinic owner and calls the service', async () => {
    const r = await cancelSocialAddonAction()
    expect(r.ok).toBe(true)
    expect(svc.removeSocialAddon).toHaveBeenCalledWith('org_1')
  })

  it('blocks a patient role', async () => {
    tenantCtx!.role = 'patient'
    const r = await cancelSocialAddonAction()
    expect(r.ok).toBe(false)
    expect(svc.removeSocialAddon).not.toHaveBeenCalled()
  })
})
