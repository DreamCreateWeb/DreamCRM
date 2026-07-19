export const metadata = {
  title: 'My Day - DreamCRM',
  description: 'Your follow-ups, conversations, and today at a glance',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getMyDay, getMyClosedFollowupsPerWeek8 } from '@/lib/services/my-day'
import { getDigestEnabled } from '@/lib/services/daily-digest'
import { getDigestOptOut } from '@/lib/services/staff-notification-pref'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { KpiStat } from '@/components/ui/kpi-stat'
import { EmptyState } from '@/components/ui/empty-state'
import MyDayFollowups from './my-day-followups'
import ClosedHeartbeat from './closed-heartbeat'
import DigestToggle from './digest-toggle'
import { formatClinicTime, formatClinicDayHeader } from '@/lib/format-datetime'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'

export default async function MyDayPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/')

  const [data, digestEnabled, digestOptOut, timeZone, closedPerWeek8] = await Promise.all([
    getMyDay(ctx.organizationId, ctx.userId),
    getDigestEnabled(ctx.organizationId),
    getDigestOptOut(ctx.organizationId, ctx.userId),
    getClinicTimeZone(ctx.organizationId),
    // The page's ONE heartbeat (law 7): the staffer's OWN closed follow-ups,
    // 8 clinic-local weeks — org + user scoped.
    getMyClosedFollowupsPerWeek8(ctx.organizationId, ctx.userId),
  ])
  const firstName = (ctx.userName ?? '').split(' ')[0] || 'there'
  const followupsDue = data.followups.overdue + data.followups.today

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow={`Daily · ${ctx.organizationName}`}
        title={`Good day, ${firstName}`}
        subtitle="Your follow-ups and conversations, plus today's schedule — everything waiting on you in one place."
        actions={
          <ActionButton variant="secondary" href="/followups?mine=1">
            All my follow-ups
          </ActionButton>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <KpiStat
          label="Follow-ups due"
          value={followupsDue}
          sub={data.followups.overdue > 0 ? `${data.followups.overdue} overdue` : 'overdue + today'}
          tone={followupsDue > 0 ? 'warn' : 'neutral'}
          href="/followups?mine=1"
        />
        <KpiStat
          label="Need a text"
          value={data.unconfirmedTodayCount}
          sub="today, still unconfirmed"
          tone={data.unconfirmedTodayCount > 0 ? 'warn' : 'neutral'}
          href="/appointments?window=today&attention=unconfirmed"
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
          label="Balances"
          value={data.balances.count}
          sub={data.balances.count > 0 ? `$${Math.round(data.balances.totalCents / 100).toLocaleString('en-US')} owed` : 'all paid up'}
          tone={data.balances.count > 0 ? 'warn' : 'neutral'}
          // The Collections board is the purpose-built landing for this stat —
          // balances + dunning state + send-pay-link in one place.
          href="/payments/collections"
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
          <ClosedHeartbeat series={closedPerWeek8} />
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
                        <span className="shrink-0 text-xs font-semibold text-white bg-rose-500 rounded-full px-1.5 py-0.5 tabular-nums">
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
                      {formatClinicTime(a.startTime, timeZone)}
                    </span>
                    <Link href={`/patients/${a.patientId}`} className="text-sm text-gray-700 dark:text-gray-200 hover:underline truncate flex-1">
                      {a.patientName}
                    </Link>
                    {/* In-office flow breadcrumb (set from the agenda drawer). */}
                    {(a.status === 'scheduled' || a.status === 'confirmed') &&
                      (a.seatedAt ? (
                        <span className="shrink-0 text-xs" title="In the chair">🪑</span>
                      ) : a.arrivedAt ? (
                        <span className="shrink-0 text-xs" title="Arrived — in the waiting room">🚪</span>
                      ) : null)}
                    <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500 capitalize">{a.type.replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* ── Tomorrow's patients — the per-patient audit ─────────────────
          Every visit on tomorrow's schedule checked against the front-desk
          list (confirmation, intake, balance, deposit, reachability, first
          visits, birthdays). Live — never a stale overnight snapshot. */}
      <section className="v2-card p-5 mt-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Tomorrow&rsquo;s patients — worth a look
            {data.tomorrow.visitCount > 0 && (
              <span className="ml-2 font-normal text-xs text-gray-500 dark:text-gray-400">
                {formatClinicDayHeader(new Date(`${data.tomorrow.dayKey}T12:00:00`), timeZone)} · {data.tomorrow.items.length} of {data.tomorrow.visitCount} visits need prep
              </span>
            )}
          </h2>
          <Link href="/appointments?window=tomorrow" className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400">
            Tomorrow&rsquo;s agenda →
          </Link>
        </div>
        {data.tomorrow.visitCount === 0 ? (
          <EmptyState icon="🌤️" title="Nothing on tomorrow's schedule yet" body="When visits are booked, each patient gets checked here the day before." />
        ) : data.tomorrow.items.length === 0 ? (
          <EmptyState icon="✅" title={`All ${data.tomorrow.visitCount} of tomorrow's visits are prepped`} body="Confirmed, forms in, nothing owed — a clean morning ahead." />
        ) : (
          <ul className="divide-y divide-[color:var(--color-hairline)]">
            {data.tomorrow.items.map((it) => (
              <li key={it.appointmentId} className="py-2.5 flex items-start gap-3">
                <span className="shrink-0 w-14 pt-0.5 text-xs font-mono-num text-gray-500 dark:text-gray-400 tabular-nums">
                  {formatClinicTime(it.startTime, timeZone)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/patients/${it.patientId}`} className="text-sm font-medium text-gray-800 dark:text-gray-100 hover:underline">
                      {it.patientName}
                    </Link>
                    <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">
                      {it.type.replace(/_/g, ' ')}
                      {it.providerName ? ` · ${it.providerName}` : ''}
                    </span>
                  </div>
                  <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    {it.flags.map((f) => (
                      <li key={f.key} className="text-xs text-amber-700 dark:text-amber-300">
                        {f.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Personal morning-email switch — only when the clinic sends the digest. */}
      {digestEnabled && <DigestToggle initialOptedOut={digestOptOut} />}
    </div>
  )
}
