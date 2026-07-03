import { NextResponse } from 'next/server'
import { runOutreach } from '@/lib/services/prospect-outreach'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Cold-outreach drip tick — sends due sequence touches up to today's
 * warm-up allowance, inside prospect-local business hours (weekdays only),
 * with send-time suppression + known-contact guards and per-touch atomic
 * claims. Runs fully in dry-run until an outreach sender is configured and
 * config.dryRun is switched off. CRON_SECRET-gated. Returns
 * `{ ok, scanned, sent, dryRun, windowSkipped, guardSkipped, completed, errors }`.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await runOutreach()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}

export const POST = run
export const GET = run
