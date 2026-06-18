export const metadata = {
  title: 'Follow-ups - DreamCRM',
  description: 'Patient follow-ups your team needs to action',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listOpenFollowups, type OpenFollowupFilters } from '@/lib/services/patient-followups'
import ModuleHint from '@/components/onboarding/module-hint'
import FollowupsBoard from './followups-board'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function FollowupsPage({ searchParams }: PageProps) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/')

  const params = await searchParams
  const mine = params.mine === '1'
  const dueRaw = typeof params.due === 'string' ? params.due : undefined
  const due = (['overdue', 'today', 'upcoming'] as const).includes(dueRaw as never)
    ? (dueRaw as 'overdue' | 'today' | 'upcoming')
    : undefined
  const includeDone = params.done === '1'

  const filters: OpenFollowupFilters = {
    assignedTo: mine ? ctx.userId : undefined,
    due,
    includeDone,
  }

  const rows = await listOpenFollowups(ctx.organizationId, filters)

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pt-6 w-full max-w-[96rem] mx-auto -mb-2">
        <ModuleHint id="followups" />
      </div>
      <FollowupsBoard
        rows={rows}
        orgName={ctx.organizationName ?? 'Your clinic'}
        filters={{ mine, due, includeDone }}
      />
    </>
  )
}
