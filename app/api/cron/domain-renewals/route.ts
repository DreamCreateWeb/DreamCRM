import { NextResponse } from 'next/server'
import { runDomainRenewals } from '@/lib/services/domain-purchase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Renew platform-bought domains coming up on expiry (30-day window, daily
 * retries): active clinic + included-in-plan → platform renews; active
 * clinic + paid domain → charge the clinic's card first, then renew
 * (refund if the registrar renewal fails); inactive subscription → release
 * (auto-renew is off at the registrar, so the domain lapses — never renewed
 * on the platform's dime for a churned clinic).
 *
 * Wiring: EventBridge schedule rule → POST/GET with
 * `Authorization: Bearer ${CRON_SECRET}` (same pattern as the other crons).
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await runDomainRenewals()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export { run as GET, run as POST }
