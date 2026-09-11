import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { runProposalGenerators } from '@/lib/services/proposal-generators'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Proposal generators — the machine notices work it could do (an unreplied
 * review, a fresh website inquiry, quiet social channels, a quiet recall
 * engine), FINISHES it as a draft, and files it into the Approval Inbox.
 * Also sweeps stale/invalidated proposals so the inbox stays honest.
 * CRON_SECRET-gated; hourly; demo clinics never generate (their inbox is
 * seeded).
 */
/**
 * The per-clinic walk inside is BUDGETED and RESUMABLE (lib/cron-budget.ts):
 * it stops before this route's maxDuration does and the next tick picks up
 * after the last clinic served. `sweep.completed: false` in the response means
 * the tick ran out of time, not that anything failed — read `sweep.remaining`
 * for how many are waiting.
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const result = await runProposalGenerators()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
