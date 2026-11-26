export const metadata = {
  title: 'The Huddle - DreamCRM',
  description: 'The morning meeting, already prepared: yesterday, today patient by patient, and what is next',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getHuddle } from '@/lib/services/huddle'
import { getPmsLink } from '@/lib/services/pms-link'
import { pmsConnected } from '@/lib/pms-link'
import HuddleBoard from './huddle-board'

/**
 * THE HUDDLE (docs/daily-tools.md, slice H1) — the first of the daily
 * tools. A read-only page: the service assembles it from what the app
 * already holds (rules, never the AI), and the board decides only how it
 * is shown. Every time on it is formatted on the server against the
 * clinic's timezone.
 */
export default async function HuddlePage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'caller') redirect('/calls')
  if (ctx.tenantType !== 'clinic') redirect('/')

  const [view, pmsLink] = await Promise.all([
    getHuddle(ctx.organizationId, ctx.userId),
    // The one read of "is a PMS feeding us" — decides what an empty day says.
    getPmsLink(ctx.organizationId),
  ])

  return <HuddleBoard view={view} clinicName={ctx.organizationName ?? 'Your clinic'} pmsConnected={pmsConnected(pmsLink)} />
}
