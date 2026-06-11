import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Stripe Connect OAuth callback — the single-use `shop_connect_state` nonce
 * cookie must be cleared on EVERY exit path (error param, missing params,
 * invalid state, nonce mismatch, org change, exchange failure, AND success),
 * with the SAME path it was set under (`/api/connect/shop`) or the browser
 * keeps the path-scoped cookie around to be replayed.
 */

const tenant = {
  ctx: { tenantType: 'clinic', organizationId: 'org_1' } as {
    tenantType: string
    organizationId: string
  },
}
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => tenant.ctx),
}))

const exchange = { accountId: 'acct_123', shouldThrow: false }
vi.mock('@/lib/services/shop-connect', () => ({
  exchangeConnectCode: vi.fn(async () => {
    if (exchange.shouldThrow) throw new Error('exchange failed')
    return exchange.accountId
  }),
  saveConnectedAccount: vi.fn(async () => {}),
}))

import { GET } from '@/app/api/connect/shop/callback/route'
import { NextRequest } from 'next/server'

function makeReq(query: Record<string, string>, cookieNonce?: string): NextRequest {
  const url = new URL('https://www.dreamcreatestudio.com/api/connect/shop/callback')
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  const req = new NextRequest(url)
  // happy-dom doesn't parse a constructor `cookie` header into req.cookies, so
  // set it explicitly (env-independent) to model the browser sending the nonce.
  if (cookieNonce !== undefined) req.cookies.set('shop_connect_state', cookieNonce)
  return req
}

/** The state cookie is "cleared" when a Set-Cookie clears it (maxAge 0 / empty)
 *  on the right path. */
function assertCookieCleared(res: Response) {
  const setCookie = res.headers.get('set-cookie') ?? ''
  expect(setCookie).toContain('shop_connect_state=')
  expect(setCookie.toLowerCase()).toContain('path=/api/connect/shop')
  // Cleared = either Max-Age=0 or an Expires in the past (Next sets Max-Age=0).
  expect(/max-age=0/i.test(setCookie) || /expires=/i.test(setCookie)).toBe(true)
}

function stateFor(orgId: string, nonce: string): string {
  return Buffer.from(JSON.stringify({ orgId, nonce })).toString('base64url')
}

beforeEach(() => {
  tenant.ctx = { tenantType: 'clinic', organizationId: 'org_1' }
  exchange.accountId = 'acct_123'
  exchange.shouldThrow = false
})

describe('shop connect callback — cookie is cleared on every exit path', () => {
  it('clears the cookie on a provider error param', async () => {
    const res = await GET(makeReq({ error: 'access_denied' }))
    assertCookieCleared(res)
  })

  it('clears the cookie when code/state are missing', async () => {
    const res = await GET(makeReq({}))
    assertCookieCleared(res)
  })

  it('clears the cookie on an undecodable state', async () => {
    const res = await GET(makeReq({ code: 'c', state: '!!!not-base64-json!!!' }, 'nonce_1'))
    assertCookieCleared(res)
  })

  it('clears the cookie on a nonce mismatch (no/wrong cookie)', async () => {
    const res = await GET(makeReq({ code: 'c', state: stateFor('org_1', 'nonce_good') }, 'nonce_BAD'))
    assertCookieCleared(res)
  })

  it('clears the cookie when the active org changed mid-flow', async () => {
    tenant.ctx = { tenantType: 'clinic', organizationId: 'org_OTHER' }
    const res = await GET(makeReq({ code: 'c', state: stateFor('org_1', 'nonce_1') }, 'nonce_1'))
    assertCookieCleared(res)
  })

  it('clears the cookie when the code exchange fails', async () => {
    exchange.shouldThrow = true
    const res = await GET(makeReq({ code: 'c', state: stateFor('org_1', 'nonce_1') }, 'nonce_1'))
    assertCookieCleared(res)
  })

  it('clears the cookie on the SUCCESS path too', async () => {
    const res = await GET(makeReq({ code: 'c', state: stateFor('org_1', 'nonce_1') }, 'nonce_1'))
    assertCookieCleared(res)
    // And it redirected back to /shop with the connected flag.
    expect(res.headers.get('location')).toContain('connected=1')
  })
})
