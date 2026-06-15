import { NextResponse } from 'next/server'
import { syncAllGoogleBusinessProfiles } from '@/lib/services/gbp-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Refresh hours/address/phone/photos from Google Business Profile for every org
 * with a connected, non-demo GBP account (via Zernio). NON-force — the
 * background sweep respects each field's manual flag (it never clobbers a
 * deliberate clinic edit; only fields whose source is 'google' get updated).
 * Idempotent, so any cadence is safe; daily/hourly is the intended one.
 *
 * Wiring: EventBridge schedule rule → POST/GET this route with
 * `Authorization: Bearer ${CRON_SECRET}`. Mirrors sync-google-reviews — same
 * auth pattern, nodejs runtime, 120s budget. NOTE: CRON_SECRET-gated routes
 * MUST be in the middleware public-path allowlist (`/api/cron` already is) or
 * they 302 to /signin (the PR #185 gotcha).
 *
 * Returns: `{ ok, scanned, applied, failed, errors }` JSON.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await syncAllGoogleBusinessProfiles()
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
