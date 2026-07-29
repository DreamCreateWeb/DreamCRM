import { NextResponse } from 'next/server'
import { runGuardianSweep } from '@/lib/services/guardian-alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * THE GUARDIAN (Transformation Phase 4) — Dream Create's daily watch over
 * every clinic's engine. Sweeps engine health, emails the platform admins
 * about the practices that need a human, and remembers what it said so a
 * persisting problem is raised weekly rather than every morning.
 *
 * Platform-facing only: no clinic ever receives any of this, and the sweep
 * never touches clinic data. CRON_SECRET-gated; scheduled once daily.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await runGuardianSweep()
    return NextResponse.json({ ok: true, ...result })
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
