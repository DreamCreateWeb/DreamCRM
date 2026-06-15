import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/auth/context'
import { zernioConfigured } from '@/lib/zernio'
import { getGoogleBusinessConnectUrl } from '@/lib/services/zernio'
import { ZERNIO_PLATFORMS, type ZernioPlatform } from '@/lib/types/zernio'

/**
 * Start the Zernio hosted-OAuth connect flow. Authed dashboard route (the
 * session cookie gets it past middleware; we re-gate here): clinic tenant +
 * owner/admin — on ANY plan. Google Business is free + separate on every tier
 * (Basic included; see lib/types/social-entitlements.ts), so there is NO plan
 * gate here. Resolves the org's Zernio profile, asks Zernio for the Google
 * consent `authUrl`, and 302s the user there.
 *
 * The UI opens this in a NEW TAB and polls on focus, so even if Zernio returns
 * the user to its own dashboard (the default when no redirect_url is honored),
 * coming back to /integrations re-detects the connection via the sync action.
 * We DO pass our callback as redirect_url so, when Zernio supports it, the user
 * lands back on /integrations directly.
 */
function appBase(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
}

export async function GET(req: NextRequest) {
  if (!zernioConfigured()) {
    return NextResponse.json({ error: 'Zernio is not configured on this environment.' }, { status: 503 })
  }

  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (ctx.tenantType !== 'clinic') {
    return NextResponse.json({ error: 'Integrations are only available for clinic tenants.' }, { status: 403 })
  }
  if (ctx.role === 'patient' || ctx.role === 'member') {
    return NextResponse.json({ error: 'Only an owner or admin can connect Google Business.' }, { status: 403 })
  }
  // NO plan gate — Google Business is free on every tier (Basic included).

  // Only Google Business is connectable in the foundation. Reject anything else.
  const requested = (req.nextUrl.searchParams.get('platform') ?? 'googlebusiness') as ZernioPlatform
  if (requested !== 'googlebusiness' || !ZERNIO_PLATFORMS.includes(requested)) {
    return NextResponse.json({ error: 'Only Google Business can be connected right now.' }, { status: 400 })
  }

  const redirectUrl = `${appBase(req)}/api/integrations/zernio/callback`
  try {
    const authUrl = await getGoogleBusinessConnectUrl(ctx.organizationId, ctx.organizationName, redirectUrl)
    return NextResponse.redirect(authUrl)
  } catch (e) {
    // Bounce back to /integrations with an error param the page can surface.
    const url = new URL('/integrations', appBase(req))
    url.searchParams.set('zernioError', (e as Error).message.slice(0, 200))
    return NextResponse.redirect(url)
  }
}
