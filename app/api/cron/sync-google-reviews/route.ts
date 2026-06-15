import { NextResponse } from 'next/server'
import { syncAllGoogleReviews } from '@/lib/services/google-reviews'
import { syncAllFacebookReviews } from '@/lib/services/facebook-reviews'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Sync platform reviews — Google Business reviews AND Facebook recommendations —
 * for every org with a connected, non-demo Zernio connection (via Zernio).
 * Idempotent upsert by (orgId, platform, externalReviewId) means any cadence is
 * safe; hourly is the intended one. Demo connections never hit the network
 * (their seeded reviews stand). Each platform sweep is best-effort + independent
 * (a Facebook failure never aborts the Google sweep, and vice versa).
 *
 * Wiring: EventBridge schedule rule → POST/GET this route with
 * `Authorization: Bearer ${CRON_SECRET}`. Matches the auto-send-reviews cron —
 * same auth pattern, same shape, same nodejs runtime / 120s budget. NOTE:
 * CRON_SECRET-gated routes MUST be in the middleware public-path allowlist
 * (`/api/cron` already is) or they 302 to /signin (the PR #185 gotcha).
 *
 * Returns: `{ ok, google, facebook }` JSON (each = `{ scanned, synced, failed,
 * errors }`).
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    // Run both sweeps; each is internally best-effort, so a settled pair is fine.
    const [google, facebook] = await Promise.all([syncAllGoogleReviews(), syncAllFacebookReviews()])
    return NextResponse.json({ ok: true, google, facebook })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}

export const POST = run
export const GET = run
