import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/auth/context'
import { exchangeCodeForTokens } from '@/lib/services/gmail'
import { saveGscConnection, listGscSites, setGscSite } from '@/lib/services/gsc'

function redirectUri(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  return `${base}/api/oauth/gsc/callback`
}

function backTo(req: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL('/seo', req.url)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = NextResponse.redirect(url)
  res.cookies.delete('gsc_oauth_state')
  return res
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const stateB64 = req.nextUrl.searchParams.get('state')
  const errorParam = req.nextUrl.searchParams.get('error')
  if (errorParam) return backTo(req, { gscError: errorParam })
  if (!code || !stateB64) return backTo(req, { gscError: 'Missing OAuth response parameters' })

  let decoded: { orgId: string; nonce: string }
  try {
    decoded = JSON.parse(Buffer.from(stateB64, 'base64url').toString('utf8'))
  } catch {
    return backTo(req, { gscError: 'Invalid OAuth state' })
  }

  const cookieNonce = req.cookies.get('gsc_oauth_state')?.value
  if (!cookieNonce || cookieNonce !== decoded.nonce) {
    return backTo(req, { gscError: 'OAuth state mismatch — please try connecting again' })
  }

  const ctx = await requireTenant()
  if (ctx.organizationId !== decoded.orgId) {
    return backTo(req, { gscError: 'Active organization changed during the connection' })
  }
  if (ctx.tenantType !== 'clinic') {
    return backTo(req, { gscError: 'Only clinic accounts can connect Search Console' })
  }

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri(req))
    await saveGscConnection({ organizationId: ctx.organizationId, connectedByUserId: ctx.userId, tokens })
  } catch (err) {
    return backTo(req, { gscError: (err as Error).message })
  }

  // Auto-select the property when the account has exactly one verified site.
  try {
    const sites = await listGscSites(ctx.organizationId)
    if (sites.length === 1) await setGscSite(ctx.organizationId, sites[0].siteUrl)
  } catch (err) {
    console.warn('[gsc.callback] site list/auto-select failed', err)
  }

  return backTo(req, { gscConnected: '1' })
}
