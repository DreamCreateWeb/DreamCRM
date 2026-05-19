import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/lib/db'
import { decodeToken } from '@/lib/marketing/tokens'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const payload = decodeToken(token)
  if (!payload || payload.p !== 'k' || !payload.u) {
    return NextResponse.json({ error: 'invalid token' }, { status: 400 })
  }
  // Only allow http(s) redirects to prevent open-redirect abuse
  if (!/^https?:\/\//i.test(payload.u)) {
    return NextResponse.json({ error: 'invalid target' }, { status: 400 })
  }
  try {
    await db.insert(schema.campaignEvents).values({
      campaignId: payload.c,
      recipientEmail: payload.e,
      customerId: payload.i ?? null,
      type: 'click',
      meta: { url: payload.u, ua: req.headers.get('user-agent') ?? null },
    })
  } catch (err) {
    console.warn('[track.click]', err)
  }
  return NextResponse.redirect(payload.u, 302)
}
