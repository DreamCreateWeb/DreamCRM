import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { StatusPill } from '@/components/ui/status-pill'
import { KpiStat } from '@/components/ui/kpi-stat'
import { EmptyState } from '@/components/ui/empty-state'
import { ActionButton } from '@/components/ui/action-button'
import { TONE_TEXT, type Tone } from '@/lib/ui/encodings'
import { ACTIVATION_EVENTS } from '@/lib/first-week'
import { FEATURE_BY_KEY } from '@/lib/feature-switches'
import PmsRequestActions from './pms-request-actions'
import { A1_TARGET_HOURS, describeHours } from '@/lib/activation-metrics'
import type { FirstWeekBoard as Board, FirstWeekRow } from '@/lib/services/first-week'

/**
 * One card per clinic, stuck first. Everything on it is a fact the service
 * read; the only "actions" are the doors the clinics list already has.
 */

const GRADE_TONE: Record<string, Tone> = { ready: 'ok', attention: 'warn', waiting: 'info', todo: 'neutral', na: 'neutral' }
const GRADE_WORD: Record<string, string> = { ready: 'on', attention: 'needs a look', waiting: 'pending', todo: 'not yet', na: 'n/a' }
const STAGE_LABEL: Record<FirstWeekRow['stage'], string> = { new: 'Day 0', 'first-week': 'First week', 'first-month': 'First month', settled: 'Settled' }

/** A date in the CLINIC's own day — the server runs in UTC (audit round 1). */
function shortDate(d: Date | null, timeZone: string): string {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone }) : '—'
}

function ClinicCard({ row }: { row: FirstWeekRow }) {
  const stuck = row.stuck.length > 0
  return (
    <article className={`v2-card px-5 py-4 ${stuck ? 'ring-1 ring-inset ring-amber-500/40' : ''}`} data-testid="first-week-row" data-stuck={stuck ? '1' : '0'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
            {STAGE_LABEL[row.stage]} · day <span className="font-mono-num tabular-nums">{row.day}</span>
            {row.isDemo ? ' · demo' : ''}
          </p>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
            <Link href={`/ecommerce/customers/${row.orgId}`} className="hover:underline">
              {row.name}
            </Link>
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {row.goal ? (
              <>
                Wants <span className="font-medium text-gray-800 dark:text-gray-100">“{row.goal}”</span>
              </>
            ) : (
              <span className="text-gray-500 dark:text-gray-400">No goal set yet — ask what they want more of.</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {stuck ? <StatusPill tone="warn" label={`Stuck · ${row.stuck.length}`} /> : <StatusPill tone="ok" label="On track" />}
          {row.trial.expired ? (
            <StatusPill tone="urgent" label="Trial ended · behind the wall" />
          ) : row.trial.onTrial ? (
            <StatusPill
              tone={row.trial.daysLeft != null && row.trial.daysLeft <= 2 ? 'warn' : 'info'}
              label={`Trial · ${row.trial.daysLeft ?? 0} ${row.trial.daysLeft === 1 ? 'day' : 'days'} left`}
            />
          ) : (
            row.subscriptionStatus && <StatusPill tone="neutral" label={row.subscriptionStatus.replace('_', ' ')} />
          )}
        </div>
      </div>

      {stuck && (
        <ul className={`mt-3 space-y-1 text-sm ${TONE_TEXT.warn}`} data-testid="stuck-reasons">
          {row.stuck.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Connected</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {row.facts.length === 0 && <span className="text-xs text-gray-500 dark:text-gray-400">Couldn’t read this clinic’s setup.</span>}
            {row.facts.map((f) => (
              <StatusPill key={f.id} tone={GRADE_TONE[f.grade] ?? 'neutral'} label={`${f.label}: ${GRADE_WORD[f.grade] ?? f.grade}`} title={f.summary} />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-mono-num tabular-nums">{row.patientCount}</span> patients
            {row.smsState ? ` · texting: ${row.smsState.replace(/_/g, ' ')}` : ''}
          </p>
          {row.pmsRequest && (
            <div className={`mt-1 text-xs ${TONE_TEXT.info}`} data-testid="pms-request">
              <p>
                Asked us to connect {row.pmsRequest.vendor} on {shortDate(row.pmsRequest.at, row.timeZone)}
                {row.pmsRequest.status === 'scheduled' ? ' · install scheduled' : ' · waiting on us'}
              </p>
              {/* The platform's answer (S4's status column had no writer — audit round 1): a bind marks it connected on its own; these are the other two. */}
              <PmsRequestActions orgId={row.orgId} status={row.pmsRequest.status} />
            </div>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">The machine, last 7 days</p>
          <p className="mt-1.5 text-gray-800 dark:text-gray-100">
            <span className="font-mono-num tabular-nums font-semibold">{row.workLast7}</span> things done ·{' '}
            <span className="font-mono-num tabular-nums font-semibold">{row.openCards}</span> card{row.openCards === 1 ? '' : 's'} waiting
            {row.oldestOpenCardAt ? ` (oldest ${shortDate(row.oldestOpenCardAt, row.timeZone)})` : ''}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400" data-testid="doors-open">
            Doors open:{' '}
            {row.doorsUnreadable
              ? 'couldn’t read them just now'
              : [
              ...row.doors.switches.map((k) => FEATURE_BY_KEY[k].label.toLowerCase()),
              row.doors.siteLive && 'website',
              row.doors.digest && 'morning email',
              row.doors.insurance && 'insurance',
            ]
                  .filter(Boolean)
                  .join(' · ') || 'none yet'}
          </p>
          {row.unreadable.length > 0 && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400" data-testid="row-unreadable">
              Couldn’t read just now: {row.unreadable.map((k) => UNREADABLE_LABEL[k]).join(' · ')} — not flagged.
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Last active staff session:{' '}
            {row.unreadable.includes('signIn') ? 'unknown' : row.lastStaffSignInAt ? shortDate(row.lastStaffSignInAt, row.timeZone) : 'none'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Activation</p>
          <ol className="mt-1.5 space-y-0.5" data-testid="activation">
            {ACTIVATION_EVENTS.map((e) => {
              const at = row.activation[e.key]
              const isNext = row.progress.next === e.key
              return (
                <li key={e.key} className={`flex items-center justify-between gap-2 ${at ? 'text-gray-800 dark:text-gray-100' : isNext ? TONE_TEXT.info : 'text-gray-500 dark:text-gray-400'}`}>
                  <span>
                    <span className="font-mono-num tabular-nums">{e.short}</span> {e.label}
                    {isNext ? ' — next' : ''}
                  </span>
                  <span className="font-mono-num tabular-nums text-xs">{shortDate(at, row.timeZone)}</span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </article>
  )
}

const UNREADABLE_LABEL: Record<FirstWeekRow['unreadable'][number], string> = { ledger: 'the machine’s week', signIn: 'staff sessions', activation: 'the data rails', proposals: 'the cards' }

export default function FirstWeekBoard({ board, includeDemo }: { board: Board; includeDemo: boolean }) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Customers · Dream Create"
        title="First week"
        subtitle="Where every clinic is in its first thirty days, what is connected, what the machine did, and who is stuck — the screen for the setup call and the day-7 check-in."
        actions={
          <Link href={includeDemo ? '/platform/first-week' : '/platform/first-week?demo=1'} className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline">
            {includeDemo ? 'Hide the demo clinic' : 'Show the demo clinic'}
          </Link>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <KpiStat label="In their first month" value={board.counts.inFirstMonth} />
        <KpiStat label="Stuck right now" value={board.counts.stuck} tone={board.counts.stuck > 0 ? 'warn' : 'ok'} />
        <KpiStat label="No data connected" value={board.counts.noData} tone={board.counts.noData > 0 ? 'warn' : 'ok'} />
        {/* S8: the number the program lives or dies on, over the clinics on this board. */}
        <KpiStat
          label="Time to data, median"
          value={describeHours(board.counts.medianHoursToA1)}
          sub={board.counts.medianHoursToA1 == null ? 'nobody has connected yet' : 'from signup to A1'}
          tone={board.counts.medianHoursToA1 != null && board.counts.medianHoursToA1 > A1_TARGET_HOURS ? 'warn' : undefined}
        />
      </div>

      {board.rows.length === 0 ? (
        <EmptyState
          title="No clinics yet"
          body="The first signup will show up here with its day count, its goal and what it still needs."
          action={
            <ActionButton variant="secondary" size="sm" href="/ecommerce/customers">
              Add a clinic
            </ActionButton>
          }
        />
      ) : (
        <div className="space-y-4">
          {board.rows.map((row) => (
            <ClinicCard key={row.orgId} row={row} />
          ))}
        </div>
      )}
    </div>
  )
}
