import { NextResponse } from 'next/server'
import { runSharedBrainLearning } from '@/lib/services/shared-brain'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * THE SHARED BRAIN (Transformation Phase 4) — one learning pass over the
 * whole platform. Looks at every clinic's sends and opens over the trailing
 * 90 days, decides the hour that actually gets read, and stores it as the
 * default every clinic's automations aim at.
 *
 * Patterns only, never patient data: the send/open correlation happens
 * inside Postgres and nothing but per-hour counts comes back.
 *
 * Weekly, not daily — send-time behaviour moves on the scale of seasons,
 * and a faster cadence would only chase noise. CRON_SECRET-gated.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await runSharedBrainLearning()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
