import { NextResponse } from 'next/server'
import { syncAllGoogleReviews } from '@/lib/services/google-reviews'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Sync Google Business reviews for every org with a connected, non-demo GBP
 * account (via Zernio). Idempotent upsert by (orgId, externalReviewId) means
 * any cadence is safe; hourly is the intended one. Demo connections never hit
 * the network (their seeded reviews stand).
 *
 * Wiring: EventBridge schedule rule → POST/GET this route with
 * `Authorization: Bearer ${CRON_SECRET}`. Matches the auto-send-reviews cron —
 * same auth pattern, same shape, same nodejs runtime / 120s budget. NOTE:
 * CRON_SECRET-gated routes MUST be in the middleware public-path allowlist
 * (`/api/cron` already is) or they 302 to /signin (the PR #185 gotcha).
 *
 * Returns: `{ ok, scanned, synced, failed, errors }` JSON.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await syncAllGoogleReviews()
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
