import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requireTenant } from '@/lib/auth/context'
import { shopConnectConfigured, getConnectAuthorizeUrl } from '@/lib/services/shop-connect'

function redirectUri(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  return `${base}/api/connect/shop/callback`
}

export async function GET(req: NextRequest) {
  if (!shopConnectConfigured()) {
    return NextResponse.json({ error: 'Stripe Connect is not configured on this environment.' }, { status: 503 })
  }
  const ctx = await requireTenant()
  // Each clinic connects its OWN Stripe account (platform admin can do it while
  // viewing as a clinic in demo mode).
  if (ctx.tenantType !== 'clinic') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const nonce = randomBytes(16).toString('hex')
  const state = Buffer.from(JSON.stringify({ orgId: ctx.organizationId, nonce })).toString('base64url')

  const res = NextResponse.redirect(getConnectAuthorizeUrl(state, redirectUri(req)))
  res.cookies.set('shop_connect_state', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/api/connect/shop',
  })
  return res
}
