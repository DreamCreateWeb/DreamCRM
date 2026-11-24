import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { reconcileIndexNow } from '@/lib/services/indexnow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * SEARCH NOTICES — once an hour, tell the engines that take IndexNow (Bing,
 * and through it Copilot; Yandex, Naver, Seznam, Yep, Amazon — not Google)
 * which public pages of the marketing site were added, changed or removed.
 *
 * The whole design is in lib/services/indexnow.ts. The short version: it
 * sends the DIFFERENCE between what is public and what was last announced, so
 * an hourly cadence costs nothing on an hour when nothing changed — the pass
 * reads two maps, finds them equal and returns.
 *
 * Its own route rather than a line in the scheduled-posts job, because that
 * job's schedule lives outside this repo (`OUT_OF_BAND` in
 * tests/cron-schedule-parity.test.ts) and cannot be verified from here; this
 * one is a `JOBS` entry the deploy creates.
 *
 * A PASS THAT RAN AND COULDN'T IS NOT A SUCCESS: `aborted` (a read failed)
 * answers 500 so the schedule's own failure metric sees it. A refusal by the
 * engines is NOT a 500 — the pass did its job, recorded the refusal where the
 * owner's SEO page reads it, and will try again in an hour.
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const result = await reconcileIndexNow()
    return NextResponse.json({ ok: result.status !== 'aborted', ...result }, { status: result.status === 'aborted' ? 500 : 200 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
