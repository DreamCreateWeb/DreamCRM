import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Zernio connect + callback API routes (Phase 3 PR 2 — cap-aware multi-platform).
 * Authed dashboard routes (clinic + owner/admin). GBP is free on every tier;
 * social platforms are gated by `canConnectSocialPlatform` (the cap inherently
 * enforces the plan). The service + the cap check are mocked.
 */

const ctx = {
  value: null as null | { tenantType: string; role: string; planTier: string; organizationId: string; organizationName: string; isDemo?: boolean },
}
vi.mock('@/lib/auth/context', () => ({
  getTenantContext: vi.fn(async () => ctx.value),
}))

const env = { configured: true }
const svc = {
  getPlatformConnectUrl: vi.fn(),
  syncConnectedAccounts: vi.fn(),
  simulateDemoConnect: vi.fn(),
  // Callback verifies the platform actually landed before flashing success —
  // default: every shortlisted platform present.
  getZernioConnection: vi.fn(async () => ({
    status: 'connected',
    lastError: null,
    accounts: ['googlebusiness', 'instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'].map(
      (platform) => ({ platform }),
    ),
  })),
}
const cap = {
  canConnectSocialPlatform: vi.fn(),
}
vi.mock('@/lib/zernio', () => ({
  zernioConfigured: () => env.configured,
}))
vi.mock('@/lib/services/zernio', () => ({
  getPlatformConnectUrl: (...a: unknown[]) => svc.getPlatformConnectUrl(...a),
  syncConnectedAccounts: (...a: unknown[]) => svc.syncConnectedAccounts(...a),
  simulateDemoConnect: (...a: unknown[]) => svc.simulateDemoConnect(...a),
  getZernioConnection: () => svc.getZernioConnection(),
}))
vi.mock('@/lib/services/social-billing', () => ({
  canConnectSocialPlatform: (...a: unknown[]) => cap.canConnectSocialPlatform(...a),
}))
// lib/types/zernio is the real one (the shortlist + guards are pure constants).

import { GET as connectGET } from '@/app/api/integrations/zernio/connect/route'
import { GET as callbackGET } from '@/app/api/integrations/zernio/callback/route'

function req(path: string): NextRequest {
  return new NextRequest(`https://app.example${path}`)
}

beforeEach(() => {
  ctx.value = null
  env.configured = true
  svc.getPlatformConnectUrl.mockReset()
  svc.syncConnectedAccounts.mockReset()
  svc.simulateDemoConnect.mockReset()
  cap.canConnectSocialPlatform.mockReset()
  // Default: cap allows (overridden per test).
  cap.canConnectSocialPlatform.mockResolvedValue({ allowed: true, limit: 5, current: 2 })
})

describe('GET /api/integrations/zernio/connect', () => {
  it('503 when Zernio is not configured', async () => {
    env.configured = false
    const res = await connectGET(req('/api/integrations/zernio/connect'))
    expect(res.status).toBe(503)
  })

  it('401 when not signed in', async () => {
    ctx.value = null
    const res = await connectGET(req('/api/integrations/zernio/connect'))
    expect(res.status).toBe(401)
  })

  it('403 for a non-clinic tenant', async () => {
    ctx.value = { tenantType: 'platform', role: 'owner', planTier: 'premium', organizationId: 'o', organizationName: 'P' }
    const res = await connectGET(req('/api/integrations/zernio/connect'))
    expect(res.status).toBe(403)
  })

  it('403 for a clinic member (not owner/admin)', async () => {
    ctx.value = { tenantType: 'clinic', role: 'member', planTier: 'premium', organizationId: 'o', organizationName: 'C' }
    const res = await connectGET(req('/api/integrations/zernio/connect'))
    expect(res.status).toBe(403)
  })

  it('allows a Basic-plan clinic owner to connect GBP (free on every tier, no cap)', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'basic', organizationId: 'org_1', organizationName: 'C' }
    svc.getPlatformConnectUrl.mockResolvedValue('https://accounts.google.com/x')
    const res = await connectGET(req('/api/integrations/zernio/connect'))
    expect(res.status).toBe(307)
    expect(svc.getPlatformConnectUrl).toHaveBeenCalled()
    // GBP never consults the social cap.
    expect(cap.canConnectSocialPlatform).not.toHaveBeenCalled()
  })

  it('GBP defaults the platform to googlebusiness and passes the callback redirect', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', organizationName: 'Acme' }
    svc.getPlatformConnectUrl.mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?x=1')
    const res = await connectGET(req('/api/integrations/zernio/connect?platform=googlebusiness'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('accounts.google.com')
    expect(svc.getPlatformConnectUrl).toHaveBeenCalledWith(
      'org_1',
      'Acme',
      'googlebusiness',
      'https://app.example/api/integrations/zernio/callback?platform=googlebusiness',
    )
  })

  it('opens the social shortlist — connects Instagram when under the cap', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', organizationName: 'Acme' }
    cap.canConnectSocialPlatform.mockResolvedValue({ allowed: true, limit: 5, current: 1 })
    svc.getPlatformConnectUrl.mockResolvedValue('https://www.instagram.com/oauth?x=1')
    const res = await connectGET(req('/api/integrations/zernio/connect?platform=instagram'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('instagram.com')
    expect(cap.canConnectSocialPlatform).toHaveBeenCalledWith('org_1')
    expect(svc.getPlatformConnectUrl).toHaveBeenCalledWith('org_1', 'Acme', 'instagram', expect.stringContaining('platform=instagram'))
  })

  it.each(['facebook', 'tiktok', 'youtube', 'linkedin'])('opens %s (shortlisted)', async (platform) => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', organizationName: 'Acme' }
    svc.getPlatformConnectUrl.mockResolvedValue('https://example.com/oauth')
    const res = await connectGET(req(`/api/integrations/zernio/connect?platform=${platform}`))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('https://example.com/oauth')
  })

  it('blocks a social platform at the cap → redirects to /integrations?atLimit (NO OAuth)', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', organizationName: 'Acme' }
    cap.canConnectSocialPlatform.mockResolvedValue({ allowed: false, limit: 2, current: 2, reason: 'used all' })
    const res = await connectGET(req('/api/integrations/zernio/connect?platform=instagram'))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/integrations')
    expect(loc).toContain('atLimit=instagram')
    // Critically — OAuth is never started.
    expect(svc.getPlatformConnectUrl).not.toHaveBeenCalled()
  })

  it('blocks a Basic-plan social connect (cap = 0) → /integrations?atLimit', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'basic', organizationId: 'org_1', organizationName: 'Acme' }
    cap.canConnectSocialPlatform.mockResolvedValue({ allowed: false, limit: 0, current: 0, reason: 'upgrade to Pro' })
    const res = await connectGET(req('/api/integrations/zernio/connect?platform=facebook'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('atLimit=facebook')
    expect(svc.getPlatformConnectUrl).not.toHaveBeenCalled()
  })

  it('400 for an off-shortlist platform (X / reddit / etc.)', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'o', organizationName: 'C' }
    for (const p of ['x', 'reddit', 'whatsapp', 'pinterest', 'threads', 'snapchat', 'discord', 'telegram', 'bluesky', 'bogus']) {
      const res = await connectGET(req(`/api/integrations/zernio/connect?platform=${p}`))
      expect(res.status, p).toBe(400)
    }
    expect(svc.getPlatformConnectUrl).not.toHaveBeenCalled()
  })

  it('allows an admin too', async () => {
    ctx.value = { tenantType: 'clinic', role: 'admin', planTier: 'premium', organizationId: 'org_1', organizationName: 'Acme' }
    svc.getPlatformConnectUrl.mockResolvedValue('https://accounts.google.com/x')
    const res = await connectGET(req('/api/integrations/zernio/connect'))
    expect(res.status).toBe(307)
  })

  it('redirects back to /integrations with an error param when the service throws', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', organizationName: 'Acme' }
    svc.getPlatformConnectUrl.mockRejectedValue(new Error('Zernio API 500'))
    const res = await connectGET(req('/api/integrations/zernio/connect'))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/integrations')
    expect(loc).toContain('zernioError=')
  })
})

describe('GET /api/integrations/zernio/callback', () => {
  it('syncs accounts and redirects to /integrations?connected=googlebusiness', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', organizationName: 'Acme' }
    svc.syncConnectedAccounts.mockResolvedValue(undefined)
    const res = await callbackGET(req('/api/integrations/zernio/callback?platform=googlebusiness&accountId=a1'))
    expect(svc.syncConnectedAccounts).toHaveBeenCalledWith('org_1')
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/integrations')
    expect(loc).toContain('connected=googlebusiness')
  })

  it('flashes the connected social platform from the platform param', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', organizationName: 'Acme' }
    svc.syncConnectedAccounts.mockResolvedValue(undefined)
    const res = await callbackGET(req('/api/integrations/zernio/callback?platform=instagram'))
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('connected=instagram')
  })

  it('falls back to googlebusiness for an off-list platform param', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', organizationName: 'Acme' }
    svc.syncConnectedAccounts.mockResolvedValue(undefined)
    const res = await callbackGET(req('/api/integrations/zernio/callback?platform=bogus'))
    expect(res.headers.get('location')).toContain('connected=googlebusiness')
  })

  it('redirects to /integrations (no sync) for a non-clinic context', async () => {
    ctx.value = { tenantType: 'platform', role: 'owner', planTier: 'premium', organizationId: 'o', organizationName: 'P' }
    const res = await callbackGET(req('/api/integrations/zernio/callback'))
    expect(svc.syncConnectedAccounts).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toContain('/integrations')
  })

  it('surfaces a sync error via the zernioError param', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', organizationName: 'Acme' }
    svc.syncConnectedAccounts.mockRejectedValue(new Error('sync boom'))
    const res = await callbackGET(req('/api/integrations/zernio/callback'))
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('zernioError=')
  })
})

describe('GET /api/integrations/zernio/connect — demo mode', () => {
  it('SIMULATES the connection (no real OAuth) and redirects back connected', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_demo', organizationName: 'Dream Dental', isDemo: true }
    const res = await connectGET(req('/api/integrations/zernio/connect?platform=googlebusiness'))
    expect(svc.simulateDemoConnect).toHaveBeenCalledWith('org_demo', 'googlebusiness')
    // No real OAuth URL is requested in demo.
    expect(svc.getPlatformConnectUrl).not.toHaveBeenCalled()
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/integrations')
    expect(loc).toContain('connected=googlebusiness')
  })
})
