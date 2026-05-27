import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/auth/context'
import { exchangeCodeForTokens, saveConnectedAccount } from '@/lib/services/gmail'
import { registerWatch, syncAccount } from '@/lib/services/mailbox'

// Behind App Runner, req.url resolves to the container's internal bind host
// (0.0.0.0) — never use it for browser-facing redirects. Use the public origin.
function appBase(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
}

function redirectUri(req: NextRequest): string {
  return `${appBase(req)}/api/oauth/gmail/callback`
}

function errorRedirect(req: NextRequest, message: string): NextResponse {
  const url = new URL('/inbox/settings', appBase(req))
  url.searchParams.set('error', message)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const stateB64 = req.nextUrl.searchParams.get('state')
  const errorParam = req.nextUrl.searchParams.get('error')
  if (errorParam) return errorRedirect(req, errorParam)
  if (!code || !stateB64) return errorRedirect(req, 'Missing OAuth response parameters')

  let decoded: { orgId: string; nonce: string }
  try {
    decoded = JSON.parse(Buffer.from(stateB64, 'base64url').toString('utf8'))
  } catch {
    return errorRedirect(req, 'Invalid OAuth state')
  }

  const cookieNonce = req.cookies.get('gmail_oauth_state')?.value
  if (!cookieNonce || cookieNonce !== decoded.nonce) {
    return errorRedirect(req, 'OAuth state mismatch — please try connecting again')
  }

  const ctx = await requireTenant()
  if (ctx.organizationId !== decoded.orgId) {
    return errorRedirect(req, 'Active organization changed during OAuth flow')
  }
  if (ctx.tenantType === 'patient') {
    return errorRedirect(req, 'Patient accounts cannot connect inboxes')
  }

  let tokens
  try {
    tokens = await exchangeCodeForTokens(code, redirectUri(req))
  } catch (err) {
    return errorRedirect(req, (err as Error).message)
  }

  let saved
  try {
    saved = await saveConnectedAccount({
      organizationId: ctx.organizationId,
      connectedByUserId: ctx.userId,
      tokens,
    })
  } catch (err) {
    return errorRedirect(req, (err as Error).message)
  }

  // Run the initial sync inline. Fire-and-forget gets killed when the
  // serverless function returns its redirect response. Adds ~1-3s of
  // latency to the OAuth round-trip in exchange for the inbox being
  // populated by the time the user lands on /inbox.
  try {
    await syncAccount(saved.accountId, ctx.organizationId, { limit: 50 })
  } catch (err) {
    console.warn('[gmail.callback] initial sync failed', err)
  }

  // Register the Gmail push-notification watch so new mail arrives in
  // near-real-time. Skipped silently if the Pub/Sub topic env var isn't
  // configured (preview deploys, local dev without GCP wiring).
  if (process.env.GMAIL_PUBSUB_TOPIC) {
    try {
      await registerWatch(saved.accountId)
    } catch (err) {
      console.warn('[gmail.callback] watch() registration failed', err)
    }
  }

  const url = new URL('/inbox/settings', appBase(req))
  url.searchParams.set('connected', saved.emailAddress)
  const res = NextResponse.redirect(url)
  res.cookies.delete('gmail_oauth_state')
  return res
}
