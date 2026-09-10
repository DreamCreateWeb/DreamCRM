import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { runGraderNurture } from '@/lib/services/grader-nurture'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Grader-lead nurture (marketing-engine Part 9 C①): the day-3 "one fix"
 * nudge and the day-14 re-grade invite, both suppression-honoring, both
 * stamped so a row is considered exactly once per touch. Daily — the
 * windows are wide and every pass is idempotent.
 *
 * Wiring: EventBridge schedule rule → POST/GET with
 * `Authorization: Bearer ${CRON_SECRET}` (same pattern as the siblings).
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const result = await runGraderNurture()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
