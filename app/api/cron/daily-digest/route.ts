import { NextResponse } from 'next/server'
import { runDailyDigest } from '@/lib/services/daily-digest'
import { runProspectingDigest } from '@/lib/services/prospecting-digest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Morning digest — email each opted-in clinic's staff their follow-ups due,
 * visits to confirm, and new leads, linking back to /my-day. Idempotent per
 * user per day via daily_digest_log; demo clinics skipped; quiet when a person
 * has nothing waiting. CRON_SECRET-gated. Scheduled once daily (early morning).
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await runDailyDigest()
    // The platform's own hunt digest rides the same daily tick (separate
    // recipients + content; best-effort so a clinic-digest hiccup and this
    // never take each other down).
    const prospecting = await runProspectingDigest().catch((err) => {
      console.warn('[daily-digest] prospecting digest failed', err)
      return null
    })
    return NextResponse.json({ ok: true, ...result, prospecting })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export const POST = run
export const GET = run
