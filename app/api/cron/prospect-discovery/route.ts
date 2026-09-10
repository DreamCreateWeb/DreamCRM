import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { runDiscovery } from '@/lib/services/prospect-discovery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * NPPES prospect discovery — works the state × zip3 task grid (≤10 tasks,
 * ≤6 pages each per run) for states enabled in prospecting settings. No-ops
 * on the kill switch. Fully resumable via per-task cursors; prospect inserts
 * are conflict-safe. CRON_SECRET-gated. Returns
 * `{ ok, tasksWorked, found, imported, split, errors }`.
 */
async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  try {
    const result = await runDiscovery()
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
