import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/auth/context'
import { exchangeCodeForTokens } from '@/lib/services/gmail'
import { saveGscConnection, listGscSites, setGscSite, getPlatformOrgId } from '@/lib/services/gsc'

// Behind App Runner, req.url resolves to the container's internal bind host
// (0.0.0.0) — never use it for browser-facing redirects. Use the public origin.
function appBase(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
}

function redirectUri(req: NextRequest): string {
  return `${appBase(req)}/api/oauth/gsc/callback`
}

function backTo(req: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL('/website/seo', appBase(req))
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
  if (!ctx.platformAdmin) {
    return backTo(req, { gscError: 'Only the platform admin can connect Search Console' })
  }
  // The connection is owned by the platform org (shared across all clinics).
  // Confirm the state's target still resolves to it.
  const targetOrgId = await getPlatformOrgId()
  if (!targetOrgId || decoded.orgId !== targetOrgId) {
    return backTo(req, { gscError: 'Connection target mismatch — please try again' })
  }

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri(req))
    await saveGscConnection({ organizationId: targetOrgId, connectedByUserId: ctx.userId, tokens })
  } catch (err) {
    return backTo(req, { gscError: (err as Error).message })
  }

  // Auto-select the property when the account has exactly one verified site.
  try {
    const sites = await listGscSites(targetOrgId)
    if (sites.length === 1) await setGscSite(targetOrgId, sites[0].siteUrl)
  } catch (err) {
    console.warn('[gsc.callback] site list/auto-select failed', err)
  }

  return backTo(req, { gscConnected: '1' })
}
