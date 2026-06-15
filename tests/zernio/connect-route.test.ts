import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Zernio connect + callback API routes — gating + redirect behavior. Authed
 * dashboard routes (clinic + owner/admin + premium); the service is mocked.
 */

const ctx = {
  value: null as null | { tenantType: string; role: string; planTier: string; organizationId: string; organizationName: string },
}
vi.mock('@/lib/auth/context', () => ({
  getTenantContext: vi.fn(async () => ctx.value),
}))

const env = { configured: true }
const svc = {
  getGoogleBusinessConnectUrl: vi.fn(),
  syncConnectedAccounts: vi.fn(),
}
vi.mock('@/lib/zernio', () => ({
  zernioConfigured: () => env.configured,
}))
vi.mock('@/lib/services/zernio', () => ({
  getGoogleBusinessConnectUrl: (...a: unknown[]) => svc.getGoogleBusinessConnectUrl(...a),
  syncConnectedAccounts: (...a: unknown[]) => svc.syncConnectedAccounts(...a),
  ZERNIO_CONNECTED_QS: 'connected',
}))
// planAllows is the real one (basic<pro<premium ordering).

import { GET as connectGET } from '@/app/api/integrations/zernio/connect/route'
import { GET as callbackGET } from '@/app/api/integrations/zernio/callback/route'

function req(path: string): NextRequest {
  return new NextRequest(`https://app.example${path}`)
}

beforeEach(() => {
  ctx.value = null
  env.configured = true
  svc.getGoogleBusinessConnectUrl.mockReset()
  svc.syncConnectedAccounts.mockReset()
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

  it('403 for a below-premium clinic', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'pro', organizationId: 'o', organizationName: 'C' }
    const res = await connectGET(req('/api/integrations/zernio/connect'))
    expect(res.status).toBe(403)
  })

  it('400 for a non-google platform', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'o', organizationName: 'C' }
    const res = await connectGET(req('/api/integrations/zernio/connect?platform=instagram'))
    expect(res.status).toBe(400)
  })

  it('302s to the Zernio authUrl with our callback as redirect_url', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', organizationName: 'Acme' }
    svc.getGoogleBusinessConnectUrl.mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?x=1')
    const res = await connectGET(req('/api/integrations/zernio/connect?platform=googlebusiness'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('accounts.google.com')
    expect(svc.getGoogleBusinessConnectUrl).toHaveBeenCalledWith(
      'org_1',
      'Acme',
      'https://app.example/api/integrations/zernio/callback',
    )
  })

  it('allows an admin too', async () => {
    ctx.value = { tenantType: 'clinic', role: 'admin', planTier: 'premium', organizationId: 'org_1', organizationName: 'Acme' }
    svc.getGoogleBusinessConnectUrl.mockResolvedValue('https://accounts.google.com/x')
    const res = await connectGET(req('/api/integrations/zernio/connect'))
    expect(res.status).toBe(307)
  })

  it('redirects back to /integrations with an error param when the service throws', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', organizationName: 'Acme' }
    svc.getGoogleBusinessConnectUrl.mockRejectedValue(new Error('Zernio API 500'))
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
    const res = await callbackGET(req('/api/integrations/zernio/callback?connected=googlebusiness&accountId=a1'))
    expect(svc.syncConnectedAccounts).toHaveBeenCalledWith('org_1')
    expect(res.status).toBe(307)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/integrations')
    expect(loc).toContain('connected=googlebusiness')
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
