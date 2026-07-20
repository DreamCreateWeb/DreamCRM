export const metadata = {
  title: 'Follow-ups - DreamCRM',
  description: 'Patient follow-ups your team needs to action',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  listOpenFollowups,
  listAssignableStaff,
  getFollowupSummary,
  getFollowupsCompletedPerWeek8,
  type OpenFollowupFilters,
} from '@/lib/services/patient-followups'
import { getFollowupRuleConfig } from '@/lib/services/followup-rules'
import { getDigestEnabled } from '@/lib/services/daily-digest'
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
  // ?closedBy=me → follow-ups the signed-in user COMPLETED (status='done' +
  // completedBy) — the honest target for My Day's "You closed N this week"
  // link. Only 'me' is recognized; it resolves server-side to ctx.userId.
  const closedByMe = params.closedBy === 'me'

  const filters: OpenFollowupFilters = {
    assignedTo: mine ? ctx.userId : undefined,
    due,
    includeDone,
    completedBy: closedByMe ? ctx.userId : undefined,
  }

  const [rows, ruleConfig, digestEnabled, staff, summary, completedPerWeek8] = await Promise.all([
    listOpenFollowups(ctx.organizationId, filters),
    getFollowupRuleConfig(ctx.organizationId),
    getDigestEnabled(ctx.organizationId),
    listAssignableStaff(ctx.organizationId),
    getFollowupSummary(ctx.organizationId),
    getFollowupsCompletedPerWeek8(ctx.organizationId),
  ])

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pt-6 w-full max-w-[96rem] mx-auto -mb-2">
        <ModuleHint id="followups" />
      </div>
      <FollowupsBoard
        rows={rows}
        orgName={ctx.organizationName ?? 'Your clinic'}
        dueNowCount={summary.overdue + summary.dueToday}
        completedPerWeek8={completedPerWeek8}
        filters={{ mine, due, includeDone, closedByMe }}
        staff={staff}
        currentUserId={ctx.userId}
        ruleConfig={ruleConfig}
        digestEnabled={digestEnabled}
        canManageRules={ctx.role === 'owner' || ctx.role === 'admin'}
      />
    </>
  )
}
