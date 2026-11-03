import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { sweepPendingCustomDomains } from '@/lib/services/custom-domain'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The sweep's own budget is 240s (CUSTOM_DOMAIN_SWEEP_BUDGET_MS) + one slow
// row; this leaves it room rather than killing it mid-tenant.
export const maxDuration = 300

/**
 * CUSTOM DOMAINS (2026-10-26). Every 15 minutes, run the status check for
 * every pending custom domain on a live clinic — the managed-cert ATTACH and
 * the activation nudge live inside that check, and until this route existed
 * the only thing driving it was the Domain page's own 45s poll. A clinic that
 * added its records and closed the tab had a domain that never went live.
 *
 * Pending rows only, oldest-checked first, at most 50 per tick with 2s
 * pacing; one tenant's AWS error is reported to the Guardian and the walk
 * carries on. A domain still pending a day after Connect pages the platform
 * once (`domain_attach_manual`). Runbook: docs/custom-domains.md.
 *
 * Wiring: EventBridge schedule rule → POST/GET with
 * `Authorization: Bearer ${CRON_SECRET}` (same pattern as the other crons).
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const result = await sweepPendingCustomDomains()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

export { run as GET, run as POST }
