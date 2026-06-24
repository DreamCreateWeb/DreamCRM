import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/auth/context'
import { zernioConfigured } from '@/lib/zernio'
import { getPlatformConnectUrl } from '@/lib/services/zernio'
import { canConnectSocialPlatform } from '@/lib/services/social-billing'
import {
  GOOGLE_BUSINESS_PLATFORM,
  isConnectablePlatform,
  isSocialChannelPlatform,
  type ZernioPlatform,
} from '@/lib/types/zernio'

/**
 * Start the Zernio hosted-OAuth connect flow for ANY connectable platform —
 * Google Business OR a shortlisted social platform (Instagram / Facebook /
 * TikTok / YouTube / LinkedIn). Authed dashboard route (the session cookie gets
 * it past middleware; we re-gate here): clinic tenant + owner/admin.
 *
 * Gating:
 *  - Google Business: free + separate on EVERY plan tier (Basic included; see
 *    lib/types/social-entitlements.ts) → no plan/cap gate.
 *  - Social platforms: gated by the plan's social-connection CAP via
 *    `canConnectSocialPlatform` (which inherently enforces the plan — Basic = 0
 *    so always blocked). When at the cap, we redirect BACK to /integrations with
 *    an `?atLimit={platform}` param INSTEAD of starting OAuth, so the surface
 *    shows the upgrade / add-on CTA.
 *  - Anything off the connectable shortlist (the 9 non-offered Zernio slugs) → 400.
 *
 * The UI opens this in a NEW TAB and polls on focus, so even if Zernio returns
 * the user to its own dashboard (the default when no redirect_url is honored),
 * coming back to /integrations re-detects the connection via the refresh action.
 * We DO pass our callback as redirect_url so, when Zernio supports it, the user
 * lands back directly.
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
    return NextResponse.json({ error: 'Only an owner or admin can connect a channel.' }, { status: 403 })
  }

  // Resolve + validate the requested platform against the connectable shortlist
  // (GBP + the 5 social platforms). Reject the 9 non-offered Zernio slugs.
  const requested = (req.nextUrl.searchParams.get('platform') ?? GOOGLE_BUSINESS_PLATFORM) as ZernioPlatform
  if (!isConnectablePlatform(requested)) {
    return NextResponse.json({ error: 'That platform can’t be connected right now.' }, { status: 400 })
  }

  // SOCIAL platforms are cap-gated (the cap enforces the plan: Basic = 0). At the
  // cap → bounce to /integrations with ?atLimit so the surface shows the upgrade
  // CTA. GBP is uncapped/free and skips this entirely.
  if (isSocialChannelPlatform(requested)) {
    const check = await canConnectSocialPlatform(ctx.organizationId)
    if (!check.allowed) {
      const url = new URL('/integrations', appBase(req))
      url.searchParams.set('atLimit', requested)
      return NextResponse.redirect(url)
    }
  }

  // DEMO mode: a platform admin exploring the demo can't run a real OAuth into
  // the synthetic demo clinic, so simulate the connection (seed the synthetic
  // connected account — no network) and return to where they clicked. Without
  // this the real-OAuth attempt below bounces off the demo's fake profile and
  // "nothing happens".
  if (ctx.isDemo) {
    const { simulateDemoConnect } = await import('@/lib/services/zernio')
    await simulateDemoConnect(ctx.organizationId, requested)
    const referer = req.headers.get('referer') ?? ''
    const backPath = referer.includes('/social-posts') ? '/social-posts' : '/integrations'
    const url = new URL(backPath, appBase(req))
    url.searchParams.set('connected', requested)
    return NextResponse.redirect(url)
  }

  const redirectUrl = `${appBase(req)}/api/integrations/zernio/callback?platform=${requested}`
  try {
    const authUrl = await getPlatformConnectUrl(ctx.organizationId, ctx.organizationName, requested, redirectUrl)
    return NextResponse.redirect(authUrl)
  } catch (e) {
    // Bounce back to /integrations with an error param the page can surface.
    const url = new URL('/integrations', appBase(req))
    url.searchParams.set('zernioError', (e as Error).message.slice(0, 200))
    return NextResponse.redirect(url)
  }
}
