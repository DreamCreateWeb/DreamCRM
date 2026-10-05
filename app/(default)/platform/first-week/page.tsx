export const metadata = {
  title: 'First week - DreamCRM',
  description: 'Where every clinic is in its first thirty days, and who is stuck',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getFirstWeekBoard } from '@/lib/services/first-week'
import FirstWeekBoard from './first-week-board'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * THE FIRST WEEK — the platform cockpit (docs/ACTIVATION.md Part 5, S1).
 * A report, not a console: the owner runs the setup call and the day-7
 * check-in from this one screen. Platform tenant only.
 */
export default async function FirstWeekPage({ searchParams }: PageProps) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'platform') redirect('/dashboard')
  const params = await searchParams
  const includeDemo = params.demo === '1'
  const board = await getFirstWeekBoard({ includeDemo })
  return <FirstWeekBoard board={board} includeDemo={includeDemo} />
}
