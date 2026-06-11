import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/auth/context'
import { exchangeConnectCode, saveConnectedAccount } from '@/lib/services/shop-connect'

function appBase(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
}

function backTo(req: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL('/shop', appBase(req))
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = NextResponse.redirect(url)
  // EVERY exit path runs through here (error params, state mismatch, org change,
  // exchange failure, AND success), so the single-use OAuth nonce is always
  // cleared — a leftover cookie could be replayed against a later callback.
  // The cookie was set with `path: '/api/connect/shop'` in the start route, so
  // the delete MUST carry the same path or the browser keeps the path-scoped
  // cookie (a bare name-only delete doesn't match a path-scoped cookie).
  res.cookies.set('shop_connect_state', '', { path: '/api/connect/shop', maxAge: 0 })
  return res
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const stateB64 = req.nextUrl.searchParams.get('state')
  const errorParam = req.nextUrl.searchParams.get('error')
  if (errorParam) return backTo(req, { connectError: errorParam })
  if (!code || !stateB64) return backTo(req, { connectError: 'Missing OAuth response parameters' })

  let decoded: { orgId: string; nonce: string }
  try {
    decoded = JSON.parse(Buffer.from(stateB64, 'base64url').toString('utf8'))
  } catch {
    return backTo(req, { connectError: 'Invalid OAuth state' })
  }

  const cookieNonce = req.cookies.get('shop_connect_state')?.value
  if (!cookieNonce || cookieNonce !== decoded.nonce) {
    return backTo(req, { connectError: 'OAuth state mismatch — please try connecting again' })
  }

  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic' || ctx.organizationId !== decoded.orgId) {
    return backTo(req, { connectError: 'Active organization changed during the connection' })
  }

  try {
    const accountId = await exchangeConnectCode(code)
    await saveConnectedAccount(ctx.organizationId, accountId)
  } catch (err) {
    return backTo(req, { connectError: (err as Error).message })
  }

  return backTo(req, { connected: '1' })
}
