import { NextRequest, NextResponse } from 'next/server'
import { renewExpiringWatches } from '@/lib/services/mailbox'

/**
 * Daily Vercel cron: renews any Gmail watch() registrations that expire
 * within the next 36h. Gmail watches max out at 7 days, so a daily run
 * keeps each mailbox with a ~6-day buffer.
 *
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` when
 * invoking crons; we validate that header. Manual invocations from a
 * dev's terminal must include the same header.
 */
export async function GET(req: NextRequest) {
  // Fail CLOSED: if CRON_SECRET is unset the endpoint must reject rather than
  // run unauthenticated — it triggers Gmail API calls for every connected
  // mailbox, so an open endpoint is a quota-exhaustion vector. Matches the
  // guard every other cron/admin route uses.
  const secret = process.env.CRON_SECRET
  const got = req.headers.get('authorization') ?? ''
  if (!secret || got !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!process.env.GMAIL_PUBSUB_TOPIC) {
    return NextResponse.json({ skipped: 'GMAIL_PUBSUB_TOPIC not configured' })
  }

  try {
    const results = await renewExpiringWatches(36)
    const ok = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok)
    return NextResponse.json({
      renewed: ok,
      failed: failed.length,
      failures: failed.map((f) => ({ email: f.emailAddress, error: f.error })),
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
