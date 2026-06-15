import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/auth/context'
import { syncConnectedAccounts } from '@/lib/services/zernio'
import { ZERNIO_CONNECTED_QS } from '@/lib/types/zernio'

/**
 * Zernio's return target after a hosted-OAuth connect (when Zernio honors our
 * `redirect_url`). Zernio appends `?connected=googlebusiness&profileId=…&
 * accountId=…&username=…`. We don't trust those params for state — we just
 * re-sync the org's accounts from Zernio (authoritative) and bounce to
 * /integrations with `?connected=googlebusiness` so the page can flash success.
 *
 * Authed route (the session cookie gets it past middleware). If Zernio does NOT
 * honor redirect_url, this is never hit — the UI's focus-poll covers that path.
 */
function appBase(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
}

function backTo(req: NextRequest, params: Record<string, string>): NextResponse {
  const url = new URL('/integrations', appBase(req))
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'clinic') {
    // Not a clinic context (e.g. session changed) — land on /integrations,
    // which will redirect appropriately.
    return backTo(req, {})
  }

  try {
    await syncConnectedAccounts(ctx.organizationId)
  } catch (e) {
    return backTo(req, { zernioError: (e as Error).message.slice(0, 200) })
  }

  return backTo(req, { [ZERNIO_CONNECTED_QS]: 'googlebusiness' })
}
