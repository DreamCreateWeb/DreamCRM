export const metadata = {
  title: 'My Day - DreamCRM',
  description: 'Your follow-ups, conversations, and today at a glance',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getMyDay } from '@/lib/services/my-day'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { KpiStat } from '@/components/ui/kpi-stat'
import { EmptyState } from '@/components/ui/empty-state'
import MyDayFollowups from './my-day-followups'

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default async function MyDayPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/')

  const data = await getMyDay(ctx.organizationId, ctx.userId)
  const firstName = (ctx.userName ?? '').split(' ')[0] || 'there'
  const followupsDue = data.followups.overdue + data.followups.today

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow="Daily"
        title={`Good day, ${firstName}`}
        subtitle="Your follow-ups and conversations, plus today's schedule — everything waiting on you in one place."
        actions={
          <ActionButton variant="secondary" href="/followups?mine=1">
            All my follow-ups
          </ActionButton>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiStat
          label="Follow-ups due"
          value={followupsDue}
          sub={data.followups.overdue > 0 ? `${data.followups.overdue} overdue` : 'overdue + today'}
          tone={followupsDue > 0 ? 'warn' : 'neutral'}
          href="/followups?mine=1"
        />
        <KpiStat
          label="My conversations"
          value={data.conversations.length}
          sub="assigned to you"
          tone={data.conversations.length > 0 ? 'info' : 'neutral'}
          href="/messages"
        />
        <KpiStat
          label="Today's visits"
          value={data.todaysAppointments.length}
          sub="on the schedule"
          href="/appointments?window=today"
        />
        <KpiStat
          label="New leads"
          value={data.newLeadsCount}
          sub="waiting on the team"
          tone={data.newLeadsCount > 0 ? 'warn' : 'neutral'}
          href="/leads?status=new"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* My follow-ups (interactive) */}
        <section className="v2-card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Your follow-ups</h2>
            <Link href="/followups?mine=1" className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400">
              Open list →
            </Link>
          </div>
          <MyDayFollowups initial={data.followups.items} currentUserId={ctx.userId} />
        </section>

        <div className="space-y-4">
          {/* My conversations */}
          <section className="v2-card p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Your conversations</h2>
              <Link href="/messages" className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400">
                Inbox →
              </Link>
            </div>
            {data.conversations.length === 0 ? (
              <EmptyState icon="💬" title="No conversations assigned to you" body="Threads you take ownership of in Messages land here." />
            ) : (
              <ul className="divide-y divide-[color:var(--color-hairline)]">
                {data.conversations.map((t) => (
                  <li key={t.id} className="py-2.5">
                    <Link
                      href={`/messages?thread=${t.id}`}
                      className="flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-900/30 -mx-2 px-2 py-1 rounded"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                          {t.patientFirstName} {t.patientLastName}
                        </span>
                        {t.lastMessagePreview && (
                          <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{t.lastMessagePreview}</span>
                        )}
                      </span>
                      {t.unreadCount > 0 && (
                        <span className="shrink-0 text-[11px] font-semibold text-white bg-rose-500 rounded-full px-1.5 py-0.5 tabular-nums">
                          {t.unreadCount}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Today's schedule (shared) */}
          <section className="v2-card p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Today&rsquo;s schedule</h2>
              <Link href="/appointments?window=today" className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400">
                Full agenda →
              </Link>
            </div>
            {data.todaysAppointments.length === 0 ? (
              <EmptyState icon="🗓️" title="No visits today" body="A quiet one — or nothing's booked yet." />
            ) : (
              <ul className="divide-y divide-[color:var(--color-hairline)]">
                {data.todaysAppointments.slice(0, 8).map((a) => (
                  <li key={a.id} className="py-2 flex items-center gap-3">
                    <span className="shrink-0 w-14 text-xs font-mono-num text-gray-500 dark:text-gray-400 tabular-nums">
                      {fmtTime(a.startTime)}
                    </span>
                    <Link href={`/patients/${a.patientId}`} className="text-sm text-gray-700 dark:text-gray-200 hover:underline truncate flex-1">
                      {a.patientName}
                    </Link>
                    <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500 capitalize">{a.type.replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
