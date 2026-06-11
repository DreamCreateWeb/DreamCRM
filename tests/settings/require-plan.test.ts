import { describe, it, expect, vi } from 'vitest'

/**
 * requirePlan() is a thin server-side gate over planAllows. We mock
 * next/navigation's redirect so we can assert WHERE a below-tier clinic gets
 * sent (the Plans page with ?upgrade=<module>), and that platform/demo/in-tier
 * contexts pass through untouched.
 *
 * NOTE: do NOT mock '@/lib/db' here — the vitest `server-only` alias already
 * lets context.ts's db import load harmlessly, and a `{db:{},schema:{}}` stub
 * perturbs the '@/lib/modules' evaluation in this graph (planAllows resolves
 * wrong). requirePlan only reads ctx + planAllows, so the real (unmocked) db
 * module is never touched at runtime.
 */
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock('@/lib/auth/server', () => ({ auth: { api: { getSession: async () => null } } }))

import { planAllows } from '@/lib/modules'
import { requirePlan, type TenantContext } from '@/lib/auth/context'

const ctx = (p: Partial<TenantContext>): TenantContext => ({
  userId: 'u1',
  userEmail: 'e@x.com',
  userName: 'Test',
  platformAdmin: false,
  organizationId: 'org_1',
  organizationName: 'Acme Dental',
  organizationSlug: 'acme',
  tenantType: 'clinic',
  role: 'owner',
  planTier: 'basic',
  patientId: null,
  isDemo: false,
  ...p,
})

// NOTE: no beforeEach(redirect.mockClear()) — setup.ts already clears mock
// call history in afterEach, and adding a beforeEach here perturbs the mocked
// module graph (a known vitest quirk in this file). Each assertion that cares
// about "not called" runs in its own fresh test, so history is already clean.

describe('requirePlan', () => {
  it('is backed by the same planAllows ordering helper', () => {
    expect(planAllows('premium', 'premium')).toBe(true)
    expect(planAllows('basic', 'premium')).toBe(false)
  })

  it('passes through when the clinic meets the tier', async () => {
    await expect(requirePlan(ctx({ planTier: 'premium' }), 'premium', 'analytics')).resolves.toBeUndefined()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('passes through when the clinic exceeds the tier', async () => {
    await expect(requirePlan(ctx({ planTier: 'premium' }), 'pro', 'seo')).resolves.toBeUndefined()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('redirects a below-tier clinic to the Plans page with the gated module', async () => {
    await expect(requirePlan(ctx({ planTier: 'basic' }), 'premium', 'analytics')).rejects.toThrow(
      'REDIRECT:/settings/plans?upgrade=analytics',
    )
    expect(redirect).toHaveBeenCalledWith('/settings/plans?upgrade=analytics')
  })

  it('redirects to the bare Plans page when no module is given', async () => {
    await expect(requirePlan(ctx({ planTier: 'pro' }), 'premium')).rejects.toThrow('REDIRECT:/settings/plans')
  })

  it('never gates platform tenants (they sell the plans)', async () => {
    await expect(
      requirePlan(ctx({ tenantType: 'platform', planTier: 'basic' }), 'premium', 'analytics'),
    ).resolves.toBeUndefined()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('lets a premium demo clinic through (demo inherits the org tier)', async () => {
    await expect(
      requirePlan(ctx({ isDemo: true, planTier: 'premium' }), 'premium', 'integrations'),
    ).resolves.toBeUndefined()
    expect(redirect).not.toHaveBeenCalled()
  })
})
