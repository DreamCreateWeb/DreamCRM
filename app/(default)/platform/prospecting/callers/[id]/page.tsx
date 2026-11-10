export const metadata = {
  title: 'Caller — DreamCRM',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getCallerById, getCallerLog, listCallers, parseCallerStates } from '@/lib/services/prospect-callers'
import { getProspectingConfig } from '@/lib/services/prospecting'
import { CALLER_STATUS_LABELS, CALL_OUTCOME_LABELS, formatUtcStamp } from '@/lib/types/prospecting'
import { PageFrame } from '@/components/ui/page-frame'
import { KpiStat } from '@/components/ui/kpi-stat'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { ActionButton } from '@/components/ui/action-button'
import CallerRowActions from '../caller-row-actions'
import CallerSettingsForm from './caller-settings-form'

const LOG_LABELS: Record<string, string> = { ...CALL_OUTCOME_LABELS, skipped: 'Skipped' }

/** One caller: their numbers, their settings, their log. */
export default async function CallerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')
  const { id } = await params
  const caller = await getCallerById(id)
  if (!caller) notFound()

  const config = await getProspectingConfig()
  const [rows, log] = await Promise.all([listCallers({ timeZone: config.booking.hostTimeZone }), getCallerLog(id)])
  const stats = rows.find((r) => r.id === id)

  return (
    <PageFrame
      width="5xl"
      hub={{ href: '/platform/prospecting/callers', label: 'Callers' }}
      title={caller.name}
      subtitle={caller.email}
      actions={
        <div className="flex items-center gap-2">
          <StatusPill tone={caller.status === 'active' ? 'ok' : caller.status === 'paused' ? 'warn' : 'neutral'} label={CALLER_STATUS_LABELS[caller.status as keyof typeof CALLER_STATUS_LABELS] ?? caller.status} />
          <CallerRowActions callerId={caller.id} name={caller.name} status={caller.status} linked={Boolean(caller.userId)} />
        </div>
      }
    >
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiStat label="Holding" value={stats.assignedNow} sub={`target ${stats.dailyTarget}`} />
          <KpiStat label="Dials · 7d" value={stats.week.dials} sub={`${stats.today.dials} today`} />
          <KpiStat label="Reached · 7d" value={stats.week.reachedPct == null ? '—' : `${stats.week.reachedPct}%`} sub={`${stats.week.reached} picked up`} />
          <KpiStat label="Callbacks · 7d" value={stats.week.callbacks} />
          <KpiStat label="Meetings · 7d" value={stats.week.meetings} tone={stats.week.meetings > 0 ? 'ok' : undefined} />
          <KpiStat label="Dead numbers · 7d" value={stats.week.disconnected} sub="verification they produced" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <section className="rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] p-5 ring-1 ring-[color:var(--color-hairline)]">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Settings</h2>
          <CallerSettingsForm
            callerId={caller.id}
            dailyTarget={caller.dailyTarget}
            states={parseCallerStates(caller.states)}
            notes={caller.notes ?? ''}
          />
          <dl className="mt-4 space-y-1 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex justify-between gap-2">
              <dt>Invited</dt>
              <dd>{formatUtcStamp(caller.createdAt) ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Last active</dt>
              <dd>{formatUtcStamp(caller.lastActiveAt) ?? 'not yet'}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Their log</h2>
          {log.length === 0 ? (
            <EmptyState
              icon="📞"
              title="No calls logged yet"
              body={
                caller.userId
                  ? 'Their first outcome lands here the moment they press a key.'
                  : 'They have not accepted the invite yet — resend it if the week is running out.'
              }
              action={
                <ActionButton href="/platform/prospecting/callers" variant="secondary">
                  All callers
                </ActionButton>
              }
            />
          ) : (
            <ul className="divide-y divide-[color:var(--color-hairline)] rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] ring-1 ring-[color:var(--color-hairline)]">
              {log.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link
                      href={`/platform/prospecting?prospect=${r.prospectId}`}
                      className="font-medium text-gray-900 hover:text-teal-600 dark:text-gray-100 dark:hover:text-teal-400"
                    >
                      {r.prospectName}
                    </Link>
                    <span className="ml-2 text-gray-600 dark:text-gray-300">{LOG_LABELS[r.outcome] ?? r.outcome.replace(/_/g, ' ')}</span>
                    {r.note && <div className="text-xs text-gray-500 dark:text-gray-400">“{r.note}”</div>}
                  </div>
                  <span className="font-mono-num text-xs text-gray-500 dark:text-gray-400">{formatUtcStamp(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageFrame>
  )
}
