import { NextResponse } from 'next/server'
import { incrementViewCount } from '@/lib/services/blog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Public pageview beacon. incrementViewCount no-ops on non-published / archived
// posts, so this can't be used to inflate drafts or previews.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    await incrementViewCount(id)
  } catch {
    /* best-effort counter — never error the beacon */
  }
  return new NextResponse(null, { status: 204 })
}
