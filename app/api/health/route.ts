import { NextResponse } from 'next/server'

// Shallow liveness probe for the platform load balancer / App Runner health
// check. Deliberately does NOT touch the database — we don't want a transient
// Neon blip to make the orchestrator recycle a healthy container.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ ok: true })
}
