export const metadata = {
  title: 'Callers — DreamCRM',
  description: 'The hired cold callers working the phone-first pool.',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listCallers } from '@/lib/services/prospect-callers'
import { getProspectingConfig } from '@/lib/services/prospecting'
import { CALLER_STATUS_LABELS } from '@/lib/types/prospecting'
import { PageFrame } from '@/components/ui/page-frame'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import type { Tone } from '@/lib/ui/encodings'
import InviteCallerModal from './invite-caller-modal'
import CallerRowActions from './caller-row-actions'

const STATUS_TONE: Record<string, Tone> = {
  invited: 'info',
  active: 'ok',
  paused: 'warn',
  archived: 'neutral',
}

function pct(v: number | null): string {
  return v == null ? '—' : `${v}%`
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(d)
}

/**
 * THE CALLERS TAB (P-02) — who is calling for Dream Create, what they hold,
 * and what they produced today and this week: dials, reached %, callbacks,
 * meetings, dead numbers found. Invite, resend, pause, resume, archive.
 */
export default async function CallersPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) redirect('/')

  const config = await getProspectingConfig()
  const callers = await listCallers({ timeZone: config.booking.hostTimeZone })
  const active = callers.filter((c) => c.status === 'active')
  const holding = callers.reduce((n, c) => n + c.assignedNow, 0)

  return (
    <PageFrame
      width="6xl"
      eyebrow="Platform · Prospecting"
      title="Callers"
      subtitle={
        active.length === 0
          ? 'People you hire to work the phone-first pool. Each gets a page of their own — the queue, the script, the outcome keys — and nothing else.'
          : `${active.length} calling · ${holding} practice${holding === 1 ? '' : 's'} held right now · queues top up from the verified pool on the outreach tick (floor ${config.qualityFloor}).`
      }
      actions={<InviteCallerModal />}
    >
      {callers.length === 0 ? (
        <EmptyState
          icon="☎️"
          title="Nobody is calling for you yet"
          body="Invite a caller and they get a 7-day link to their own page. Their queue fills from the best verified practices — never a hand-raiser, never a practice you're already following up."
          action={<InviteCallerModal />}
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] ring-1 ring-[color:var(--color-hairline)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-hairline)] text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3">Caller</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Target</th>
                <th className="px-4 py-3">States</th>
                <th className="px-4 py-3 text-right">Holding</th>
                <th className="px-4 py-3 text-right" title="Today · last 7 days">
                  Dials
                </th>
                <th className="px-4 py-3 text-right">Reached</th>
                <th className="px-4 py-3 text-right">Callbacks</th>
                <th className="px-4 py-3 text-right">Meetings</th>
                <th className="px-4 py-3 text-right" title="Disconnected + wrong numbers they found">
                  Dead #
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {callers.map((c) => (
                <tr key={c.id} className="border-b border-[color:var(--color-hairline)] last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/prospecting/callers/${c.id}`}
                      className="font-medium text-gray-900 hover:text-teal-600 dark:text-gray-100 dark:hover:text-teal-400"
                    >
                      {c.name}
                    </Link>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{c.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill
                      tone={STATUS_TONE[c.status] ?? 'neutral'}
                      label={CALLER_STATUS_LABELS[c.status]}
                      title={
                        c.status === 'invited'
                          ? c.inviteSentAt
                            ? `Invite link good until ${fmtDate(c.inviteExpiresAt)} (UTC)`
                            : 'The invite email did not send — press Resend invite'
                          : c.lastActiveAt
                            ? `Last active ${fmtDate(c.lastActiveAt)} (UTC)`
                            : undefined
                      }
                    />
                    {c.status === 'invited' && !c.inviteSentAt && (
                      <div className="mt-1 text-xs text-rose-600 dark:text-rose-400">invite not sent · Resend</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{c.dailyTarget}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                    {c.states.length > 0 ? c.states.join(', ') : 'any'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900 dark:text-gray-100">{c.assignedNow}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {c.today.dials} <span className="text-gray-500 dark:text-gray-400">· {c.week.dials}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {pct(c.today.reachedPct)} <span className="text-gray-500 dark:text-gray-400">· {pct(c.week.reachedPct)}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {c.today.callbacks} <span className="text-gray-500 dark:text-gray-400">· {c.week.callbacks}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-violet-600 dark:text-violet-400">
                    {c.today.meetings} <span className="font-normal text-gray-500 dark:text-gray-400">· {c.week.meetings}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {c.today.disconnected} <span className="text-gray-500 dark:text-gray-400">· {c.week.disconnected}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <CallerRowActions callerId={c.id} name={c.name} status={c.status} linked={c.linked} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
            Each pair reads today · last 7 days, on the booking clock ({config.booking.hostTimeZone.replace(/_/g, ' ')}).
          </p>
        </div>
      )}
    </PageFrame>
  )
}
