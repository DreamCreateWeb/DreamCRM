import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requireTenant } from '@/lib/auth/context'
import { gmailOAuthConfigured, getAuthUrl } from '@/lib/services/gmail'

function redirectUri(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  return `${base}/api/oauth/gmail/callback`
}

export async function GET(req: NextRequest) {
  if (!gmailOAuthConfigured()) {
    return NextResponse.json(
      { error: 'Gmail OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.' },
      { status: 503 },
    )
  }
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // State carries the org id + a random nonce. We sign it via a cookie so
  // the callback can verify it came from this user's session.
  const nonce = randomBytes(16).toString('hex')
  const state = Buffer.from(JSON.stringify({ orgId: ctx.organizationId, nonce })).toString('base64url')

  const res = NextResponse.redirect(getAuthUrl(state, redirectUri(req)))
  res.cookies.set('gmail_oauth_state', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/api/oauth/gmail',
  })
  return res
}
