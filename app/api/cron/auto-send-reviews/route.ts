import { NextResponse } from 'next/server'
import { autoSendDueReviewRequests } from '@/lib/services/reviews'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Auto-trigger post-visit review requests for every org with
 * `clinic_review_config.autoSendEnabled=1`. Per-appointment idempotency
 * means hourly is the right cadence — a completed appointment fires
 * exactly one send, on the first tick after it passes the org's
 * configured delay (default 24h).
 *
 * Wiring: EventBridge schedule rule → POST/GET this route with
 * `Authorization: Bearer ${CRON_SECRET}`. Matches the
 * publish-scheduled-posts cron — same auth pattern, same shape, same
 * `nodejs` runtime / 120s budget.
 *
 * Returns: `{ ok, scanned, sent, skipped, failed, errors }` JSON so a
 * future ops dashboard can surface batch health.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await autoSendDueReviewRequests()
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
