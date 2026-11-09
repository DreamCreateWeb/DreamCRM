import Link from 'next/link'
import type { FirstWeekRow } from '@/lib/services/first-week'
import type { SupportThreadPeek } from '@/lib/services/messages'
import type { ClinicEngineReport } from '@/lib/services/guardian'
import { FEATURE_SWITCHES } from '@/lib/feature-switches'
import { ACTIVATION_EVENTS } from '@/lib/activation'
import { trafficDropLine } from '@/lib/guardian'
import { formatRelativeDate } from '@/lib/utils/format'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'

/**
 * The clinic page's three "where are they" cards (ML-40): the FIRST WEEK
 * (the cockpit's own row for this clinic), the SUPPORT THREAD (read-only
 * peek — opening it is the messaging surface's job) and the GUARDIAN's
 * current note. All three are the platform's voice: "the clinic", never
 * "your patients". Every card says where its numbers come from.
 */

function asText(s: string, max = 160): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function FirstWeekCard({ row, clinicName }: { row: FirstWeekRow | null; clinicName: string }) {
  const switchLabels = row ? FEATURE_SWITCHES.filter((f) => row.doors.switches.includes(f.key)).map((f) => f.label) : []
  const pms = row?.facts.find((f) => f.id === 'pms')
  return (
    <div className="v2-card p-6 mb-8" data-testid="clinic-first-week">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">First week</h2>
        <Link href="/platform/first-week" className="text-xs text-teal-700 dark:text-teal-400 hover:underline">
          Open the first-week board →
        </Link>
      </div>
      {!row ? (
        <EmptyState
          title="I couldn’t read this clinic’s first week just now"
          body="The cockpit’s read for this clinic failed, so nothing is shown rather than a guess."
          action={
            <ActionButton variant="secondary" size="sm" href="/platform/first-week">
              Open the first-week board
            </ActionButton>
          }
        />
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-gray-700 dark:text-gray-200">
            {clinicName} is on <strong>day {row.day}</strong> ({row.stage.replace('-', ' ')}).
            {row.progress.next
              ? ` Next milestone: ${ACTIVATION_EVENTS.find((e) => e.key === row.progress.next)?.label ?? row.progress.next}.`
              : ' Every first-week milestone has happened.'}
          </p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Milestones">
            {ACTIVATION_EVENTS.map((e) => (
              <li key={e.key}>
                <StatusPill tone={row.progress.done.includes(e.key) ? 'ok' : 'neutral'} label={`${e.short} ${e.label}`} />
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">The PMS</dt>
              <dd className="text-gray-800 dark:text-gray-100">
                {row.pmsRequest
                  ? `Asked us to connect ${row.pmsRequest.vendor} (${row.pmsRequest.status})`
                  : pms
                    ? pms.summary
                    : 'Unknown — the read failed'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Public site</dt>
              <dd className="text-gray-800 dark:text-gray-100">
                {row.doorsUnreadable ? 'Unknown — the read failed' : row.doors.siteLive ? 'Live' : 'Not published yet'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Switches turned on</dt>
              <dd className="text-gray-800 dark:text-gray-100">
                {row.doorsUnreadable ? 'Unknown — the read failed' : switchLabels.length > 0 ? switchLabels.join(', ') : 'None yet'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Last staff sign-in</dt>
              <dd className="text-gray-800 dark:text-gray-100" suppressHydrationWarning>
                {row.unreadable.includes('signIn') ? 'Unknown — the read failed' : row.lastStaffSignInAt ? formatRelativeDate(row.lastStaffSignInAt) : 'Never'}
              </dd>
            </div>
          </dl>
          {row.stuck.length > 0 && (
            <ul className="list-disc pl-5 text-amber-700 dark:text-amber-300" aria-label="Why they are stuck">
              {row.stuck.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            From the readiness facts, activation stamps and staff sessions — the same row the first-week board shows.
          </p>
        </div>
      )}
    </div>
  )
}

export function SupportThreadCard({ peek, unreadable }: { peek: SupportThreadPeek | null; unreadable: boolean }) {
  return (
    <div className="v2-card p-6 mb-8" data-testid="clinic-support-thread">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Support thread</h2>
      {unreadable ? (
        <EmptyState
          title="I couldn’t read the support thread just now"
          body="Open the messaging surface to see it directly."
          action={
            <ActionButton variant="secondary" size="sm" href="/messages">
              Open messages
            </ActionButton>
          }
        />
      ) : !peek || !peek.last ? (
        <EmptyState
          title="Nothing in the support thread yet"
          body="The clinic hasn’t written to Support and Support hasn’t written to them."
          action={
            <ActionButton variant="secondary" size="sm" href={peek ? `/messages?c=${peek.conversationId}` : '/messages'}>
              {peek ? 'Open the thread' : 'Open messages'}
            </ActionButton>
          }
        />
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>
            {peek.messageCount} {peek.messageCount === 1 ? 'message' : 'messages'} · last from{' '}
            {peek.last.fromSupport ? 'Support' : 'the clinic'}, {formatRelativeDate(peek.last.createdAt)}
          </p>
          <p className="text-gray-800 dark:text-gray-100">“{asText(peek.last.body)}”</p>
          <ActionButton variant="secondary" size="sm" href={`/messages?c=${peek.conversationId}`}>
            Open the thread
          </ActionButton>
        </div>
      )}
    </div>
  )
}

export function GuardianNoteCard({ report, unreadable }: { report: ClinicEngineReport | null; unreadable: boolean }) {
  const traffic = report ? trafficDropLine(report.clinicName, report.signals) : null
  return (
    <div className="v2-card p-6 mb-8" data-testid="clinic-guardian-note">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">The Guardian’s note</h2>
      {unreadable ? (
        <EmptyState
          title="I couldn’t look just now"
          body="The Guardian’s sweep was unavailable, so there is no note rather than a confident all-clear."
          action={
            <ActionButton variant="secondary" size="sm" href="/dashboard">
              Back to the Overview
            </ActionButton>
          }
        />
      ) : !report ? (
        <EmptyState
          title="The Guardian isn’t watching this clinic"
          body="A walled or churned clinic has no engine to watch, and the demo clinic is skipped."
          action={
            <ActionButton variant="secondary" size="sm" href="/dashboard">
              Back to the Overview
            </ActionButton>
          }
        />
      ) : (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-gray-800 dark:text-gray-100">{report.verdict.headline}</p>
          <p className="text-gray-600 dark:text-gray-300">{report.verdict.why}</p>
          {traffic && <p className="text-amber-700 dark:text-amber-300">{traffic}</p>}
          <p className="text-xs text-gray-500 dark:text-gray-400">From the activity log and the site’s 7-day traffic (UTC), refreshed every few minutes.</p>
        </div>
      )}
    </div>
  )
}
