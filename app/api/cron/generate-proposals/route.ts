import { NextResponse } from 'next/server'
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
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await runProposalGenerators()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
