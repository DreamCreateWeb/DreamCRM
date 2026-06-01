import { NextResponse } from 'next/server'
import { createDemoClinic } from '@/lib/services/demo-clinic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// One-shot resync of the Acme Dental Demo. createDemoClinic is idempotent:
// on a fresh DB it seeds the demo end-to-end; on an existing demo it walks
// every self-heal branch (stats label migrations, differenceVideoUrl
// overwrite when the Pexels URL is stuck, FAQ backfill, testimonials
// re-linking, etc.) so the demo always showcases the latest template.
//
// Guarded by CRON_SECRET. Real-clinic data is never touched — createDemoClinic
// scopes all writes to the `isDemo: true` org. Called from
// scripts/resync-demo.mjs on every container boot after migrations apply.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await createDemoClinic()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
