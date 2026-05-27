import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requireTenant } from '@/lib/auth/context'
import { gscOAuthConfigured, getGscAuthUrl } from '@/lib/services/gsc'

function redirectUri(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  return `${base}/api/oauth/gsc/callback`
}

export async function GET(req: NextRequest) {
  if (!gscOAuthConfigured()) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.' },
      { status: 503 },
    )
  }
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const nonce = randomBytes(16).toString('hex')
  const state = Buffer.from(JSON.stringify({ orgId: ctx.organizationId, nonce })).toString('base64url')

  const res = NextResponse.redirect(getGscAuthUrl(state, redirectUri(req)))
  res.cookies.set('gsc_oauth_state', nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/api/oauth/gsc',
  })
  return res
}
