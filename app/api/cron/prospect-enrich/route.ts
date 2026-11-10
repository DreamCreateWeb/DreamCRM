import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { runEnrichment } from '@/lib/services/prospect-enrich'
import { runVerificationSweep } from '@/lib/services/prospect-verify'
import { backfillProspectContacts } from '@/lib/services/prospect-contacts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Prospect enrichment — Places candidates → verification (P-01: listing
 * match, NPI + website liveness, phone validity) → homepage crawl →
 * AI/heuristic verdict → deterministic opportunity score, ≤25 prospects per
 * run, every spend metered against the monthly budgets (soft-pause when
 * hit). The same tick then runs the RE-VERIFY SWEEP (never-verified live
 * rows first, then anything older than 60 days, parked rows after 30; ≤25).
 * No-ops on the kill switch or a missing GOOGLE_PLACES_API_KEY.
 * CRON_SECRET-gated. Returns `{ ok, scanned, enriched, placesLookups,
 * crawls, aiScored, errors, disqualified, verify: {…} }`.
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const result = await runEnrichment()
    // The re-verify sweep rides the same tick (best-effort, never fails
    // the run — a sweep that throws is a logged zero, not a dead cron).
    const verify = await runVerificationSweep().catch((err) => {
      console.error('[prospect-enrich] verification sweep failed', err)
      return { scanned: 0, verified: 0, disqualified: 0, placesLookups: 0, phoneChecks: 0, errors: 1, skipped: 'threw' }
    })
    // Self-heal: backfill contacts for prospects enriched before the
    // reachability layer existed (best-effort, never fails the run).
    const contacts = await backfillProspectContacts().catch(() => ({ scanned: 0, synced: 0 }))
    return NextResponse.json({ ok: true, ...result, verify, contactsBackfilled: contacts.synced })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}

export const POST = run
export const GET = run
