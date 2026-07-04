import { NextResponse } from 'next/server'
import { runEnrichment } from '@/lib/services/prospect-enrich'
import { backfillProspectContacts } from '@/lib/services/prospect-contacts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Prospect enrichment — Places lookup → homepage crawl → AI/heuristic
 * verdict → deterministic opportunity score, ≤25 prospects per run, every
 * spend metered against the monthly budgets (soft-pause when hit). No-ops
 * on the kill switch or a missing GOOGLE_PLACES_API_KEY. CRON_SECRET-gated.
 * Returns `{ ok, scanned, enriched, placesLookups, crawls, aiScored, errors }`.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await runEnrichment()
    // Self-heal: backfill contacts for prospects enriched before the
    // reachability layer existed (best-effort, never fails the run).
    const contacts = await backfillProspectContacts().catch(() => ({ scanned: 0, synced: 0 }))
    return NextResponse.json({ ok: true, ...result, contactsBackfilled: contacts.synced })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}

export const POST = run
export const GET = run
