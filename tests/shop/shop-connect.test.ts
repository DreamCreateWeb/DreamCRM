import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))
vi.mock('@/lib/stripe', () => ({ stripe: {} }))

import { shopConnectConfigured, getConnectAuthorizeUrl } from '@/lib/services/shop-connect'

beforeEach(() => {
  process.env.STRIPE_CONNECT_CLIENT_ID = 'ca_test123'
})

describe('shopConnectConfigured', () => {
  it('reflects presence of the Connect client id', () => {
    expect(shopConnectConfigured()).toBe(true)
    delete process.env.STRIPE_CONNECT_CLIENT_ID
    expect(shopConnectConfigured()).toBe(false)
  })
})

describe('getConnectAuthorizeUrl', () => {
  it('builds a read_write OAuth URL carrying client id, redirect, and state', () => {
    const url = getConnectAuthorizeUrl('state123', 'https://www.dreamcreatestudio.com/api/connect/shop/callback')
    expect(url).toContain('https://connect.stripe.com/oauth/authorize')
    expect(url).toContain('response_type=code')
    expect(url).toContain('client_id=ca_test123')
    expect(url).toContain('scope=read_write')
    expect(url).toContain('state=state123')
    expect(url).toContain('redirect_uri=https%3A%2F%2Fwww.dreamcreatestudio.com%2Fapi%2Fconnect%2Fshop%2Fcallback')
  })
})
