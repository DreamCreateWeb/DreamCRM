import { NextResponse } from 'next/server'
import { customizePendingServices } from '@/lib/services/customize-services-cron'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Durable net for the Welcome Interview's per-service AI customization. The
 * interview fires `customizeServiceForClinic` for the chosen services WITHOUT
 * awaiting (so the clinic isn't blocked) — some of those background calls can
 * fail or be cut off. This cron sweeps every REAL clinic (demo orgs excluded —
 * they carry hand-written blobs) and fills any service that links to a library
 * entry but has no `customized` blob, up to a small per-org budget per run.
 *
 * Wiring: EventBridge schedule rule → POST/GET this route with
 * `Authorization: Bearer ${CRON_SECRET}`. Same auth pattern + nodejs runtime as
 * the other crons. Idempotent (skips services that already have a blob), so the
 * cadence is forgiving and re-running converges.
 *
 * Returns `{ ok, scanned, customized, orgsTouched, errors }` so a future ops
 * dashboard can read batch health.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await customizePendingServices()
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
