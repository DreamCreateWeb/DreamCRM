import { NextResponse } from 'next/server'
import { runGuardianSweep } from '@/lib/services/guardian-alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * THE GUARDIAN (Transformation Phase 4) — Dream Create's daily watch over
 * every clinic's engine. Sweeps engine health, reports the practices that
 * need a human, and remembers what it said so a persisting problem is
 * raised weekly rather than every morning.
 *
 * WHO it reports to is the audience lock (platform_config), which ships
 * closed: platform-only, so no clinic receives any of this until the owner
 * opens it. Even open, only findings a practice can ACT on reach them. The
 * sweep itself never writes to clinic data beyond that one ledger note.
 * CRON_SECRET-gated; scheduled once daily.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await runGuardianSweep()
    // A BLIND RUN IS NOT A CLEAN ONE (round-9 audit). `{ok:true, scanned:0,
    // flagged:0}` was the response for both "the platform has no live
    // clinics" and "the watcher could not read the ledger at all" — and the
    // cron log is the only place a blind day was ever visible.
    return NextResponse.json({ ok: !result.blind, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
