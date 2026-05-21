import { NextRequest, NextResponse } from 'next/server'
import { db, schema } from '@/lib/db'
import { decodeToken } from '@/lib/marketing/tokens'

// 1x1 transparent gif
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const payload = decodeToken(token)
  if (payload && payload.p === 'o') {
    try {
      await db.insert(schema.campaignEvents).values({
        campaignId: payload.c,
        recipientEmail: payload.e,
        customerId: payload.i ?? null,
        patientId: payload.pi ?? null,
        type: 'open',
        meta: { ua: req.headers.get('user-agent') ?? null },
      })
    } catch (err) {
      // Don't ever fail the pixel — opens are best-effort
      console.warn('[track.open]', err)
    }
  }
  return new NextResponse(new Uint8Array(PIXEL), {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Content-Length': String(PIXEL.length),
    },
  })
}
