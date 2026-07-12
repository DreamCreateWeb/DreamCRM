import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * The Google Business detail page (/integrations/google-business) — the light
 * GBP management surface the marketplace card's "Manage" links to. These tests
 * assert: the connected listing renders (handle + value quick links), the
 * disconnected state shows "what you get" + a connect control, the back-link,
 * and the non-clinic redirect. GBP is free on every plan — no plan gate on view.
 */

type Ctx = {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  planTier: 'basic' | 'pro' | 'premium'
  organizationId: string
  userId: string
  organizationName: string
}
let ctx: Ctx | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!ctx) throw new Error('no ctx')
    return ctx
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
  // GbpDetailControls is a client island that calls useRouter — stub it.
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const svc = vi.hoisted(() => ({
  getZernioConnection: vi.fn(),
  zernioConfigured: vi.fn(() => true),
}))
vi.mock('@/lib/services/zernio', () => ({ getZernioConnection: svc.getZernioConnection }))
vi.mock('@/lib/zernio', () => ({ zernioConfigured: svc.zernioConfigured }))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => async () => true, useConfirmSafe: () => async () => true }))
vi.mock('@/app/(default)/integrations/actions', () => ({
  syncZernioAccountsAction: vi.fn(async () => ({ ok: true })),
  disconnectChannelAction: vi.fn(async () => ({ ok: true })),
}))

import GoogleBusinessDetailPage from '@/app/(default)/integrations/google-business/page'

function conn(overrides: Record<string, unknown> = {}) {
  return {
    status: 'disconnected',
    zernioProfileId: null,
    lastError: null,
    isDemo: false,
    googleBusinessAccounts: [],
    accounts: [],
    ...overrides,
  }
}

const gbpAccount = {
  id: 'gbp_1',
  platform: 'googlebusiness',
  profileId: 'p',
  username: 'dream-dental-austin',
  displayName: 'Dream Dental',
  profilePicture: null,
  profileUrl: null,
}

beforeEach(() => {
  svc.getZernioConnection.mockReset()
  svc.zernioConfigured.mockReturnValue(true)
  ctx = {
    tenantType: 'clinic',
    role: 'owner',
    planTier: 'premium',
    organizationId: 'org_1',
    userId: 'u1',
    organizationName: 'Dream Dental',
  }
})

describe('Google Business detail page — gating', () => {
  it('patient tenant → redirects to the portal', async () => {
    ctx!.tenantType = 'patient'
    await expect(GoogleBusinessDetailPage()).rejects.toThrow('REDIRECT:/patient/dashboard')
  })

  it('platform tenant → redirects to the dashboard', async () => {
    ctx!.tenantType = 'platform'
    await expect(GoogleBusinessDetailPage()).rejects.toThrow('REDIRECT:/dashboard')
  })
})

describe('Google Business detail page — content', () => {
  it('connected → shows the handle, the back-link, and value quick links', async () => {
    svc.getZernioConnection.mockResolvedValue(
      conn({ status: 'connected', googleBusinessAccounts: [gbpAccount], accounts: [gbpAccount] }),
    )
    const ui = await GoogleBusinessDetailPage()
    render(ui)

    const back = screen.getByRole('link', { name: /All integrations/i }) as HTMLAnchorElement
    expect(back.getAttribute('href')).toBe('/integrations')

    expect(screen.getAllByText('Dream Dental').length).toBeGreaterThan(0)
    expect(screen.getByText('dream-dental-austin')).toBeTruthy()
    expect(screen.getByText('Where this shows up')).toBeTruthy()

    const reviews = screen.getByRole('link', { name: /Reviews/i }) as HTMLAnchorElement
    expect(reviews.getAttribute('href')).toBe('/growth/reviews/received')
    const search = screen.getByRole('link', { name: /Local search/i }) as HTMLAnchorElement
    expect(search.getAttribute('href')).toBe('/website/seo')
  })

  it('disconnected → shows "what you get" + the connect control (new tab)', async () => {
    svc.getZernioConnection.mockResolvedValue(conn({ status: 'disconnected' }))
    const ui = await GoogleBusinessDetailPage()
    render(ui)
    expect(screen.getByText(/What you get when you connect/i)).toBeTruthy()
    const connect = screen.getByRole('link', { name: /Connect Google Business/i }) as HTMLAnchorElement
    expect(connect.getAttribute('href')).toBe('/api/integrations/zernio/connect?platform=googlebusiness')
    expect(connect.getAttribute('target')).toBe('_blank')
  })
})
