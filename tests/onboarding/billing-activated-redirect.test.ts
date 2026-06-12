import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /billing/activated — the managed-clinic Stripe `success_url`. A pure server
 * redirect that routes the post-activation cohort:
 *   • clinic owner/admin + site still needs personalization → /welcome
 *   • clinic owner/admin + already personalized → /dashboard
 *   • anyone else (member / patient / platform) → /dashboard
 */

let tenantCtx: {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  organizationId: string
} | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

let profileRow: { tagline: string | null; onboardingInterviewCompletedAt: Date | null } | null = null
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (profileRow ? [profileRow] : []) }) }),
    }),
  },
}))

import BillingActivatedPage from '@/app/(default)/billing/activated/page'

async function redirectOf(): Promise<string> {
  try {
    await BillingActivatedPage()
  } catch (e) {
    const m = (e as Error).message
    if (m.startsWith('REDIRECT:')) return m.slice('REDIRECT:'.length)
    throw e
  }
  throw new Error('expected a redirect')
}

beforeEach(() => {
  tenantCtx = { tenantType: 'clinic', role: 'owner', organizationId: 'org_1' }
  profileRow = { tagline: null, onboardingInterviewCompletedAt: null }
})

describe('BillingActivatedPage routing', () => {
  it('owner whose site still needs personalization → /welcome', async () => {
    profileRow = { tagline: null, onboardingInterviewCompletedAt: null }
    expect(await redirectOf()).toBe('/welcome')
  })

  it('admin whose site still needs personalization → /welcome', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'admin', organizationId: 'org_1' }
    profileRow = { tagline: 'still the starter', onboardingInterviewCompletedAt: null }
    expect(await redirectOf()).toBe('/welcome')
  })

  it('owner whose site is already personalized → /dashboard', async () => {
    profileRow = { tagline: 'We make Austin smile', onboardingInterviewCompletedAt: new Date() }
    expect(await redirectOf()).toBe('/dashboard')
  })

  it('a clinic member never goes to /welcome (no site to build) → /dashboard', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'member', organizationId: 'org_1' }
    profileRow = { tagline: null, onboardingInterviewCompletedAt: null }
    expect(await redirectOf()).toBe('/dashboard')
  })

  it('a platform tenant → /dashboard', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', organizationId: 'plat' }
    expect(await redirectOf()).toBe('/dashboard')
  })

  it('a clinic owner with no profile row falls back to needs-personalization → /welcome', async () => {
    profileRow = null
    expect(await redirectOf()).toBe('/welcome')
  })
})
