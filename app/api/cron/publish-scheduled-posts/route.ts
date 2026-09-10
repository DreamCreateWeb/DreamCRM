import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { publishDueScheduledPosts } from '@/lib/services/blog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Publishes every scheduled blog post whose time has arrived (all orgs).
// Triggered hourly by EventBridge; guarded by CRON_SECRET. Idempotent.
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const result = await publishDueScheduledPosts()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export const POST = run
export const GET = run
