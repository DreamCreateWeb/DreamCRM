import { NextResponse } from 'next/server'
import { pollSmsRegistrations } from '@/lib/services/sms-registration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * SMS REGISTRATION POLL (Phase 5 limb 3, slice 2b). Advances every clinic's
 * A2P 10DLC registration through the carrier reviews: brand → campaign →
 * number → live. Dark until SMS_DRIVER=aws — the service short-circuits and
 * this reports { skipped: 'driver_off' }, so the schedule can exist before
 * the driver does (the deploy re-runs setup-cron-schedules.sh either way).
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await pollSmsRegistrations()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export { run as GET, run as POST }
