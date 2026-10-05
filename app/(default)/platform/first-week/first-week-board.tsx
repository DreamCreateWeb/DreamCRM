import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { StatusPill } from '@/components/ui/status-pill'
import { KpiStat } from '@/components/ui/kpi-stat'
import { EmptyState } from '@/components/ui/empty-state'
import { TONE_TEXT, type Tone } from '@/lib/ui/encodings'
import { ACTIVATION_EVENTS } from '@/lib/first-week'
import type { FirstWeekBoard as Board, FirstWeekRow } from '@/lib/services/first-week'

/**
 * One card per clinic, stuck first. Everything on it is a fact the service
 * read; the only "actions" are the doors the clinics list already has.
 */

const GRADE_TONE: Record<string, Tone> = { ready: 'ok', attention: 'warn', waiting: 'info', todo: 'neutral', na: 'neutral' }
const GRADE_WORD: Record<string, string> = { ready: 'on', attention: 'needs a look', waiting: 'pending', todo: 'not yet', na: 'n/a' }
const STAGE_LABEL: Record<FirstWeekRow['stage'], string> = { new: 'Day 0', 'first-week': 'First week', 'first-month': 'First month', settled: 'Settled' }

function shortDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
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
          {row.subscriptionStatus && <StatusPill tone="neutral" label={row.subscriptionStatus.replace('_', ' ')} />}
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
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">The machine, last 7 days</p>
          <p className="mt-1.5 text-gray-800 dark:text-gray-100">
            <span className="font-mono-num tabular-nums font-semibold">{row.workLast7}</span> things done ·{' '}
            <span className="font-mono-num tabular-nums font-semibold">{row.openCards}</span> card{row.openCards === 1 ? '' : 's'} waiting
            {row.oldestOpenCardAt ? ` (oldest ${shortDate(row.oldestOpenCardAt)})` : ''}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Doors open: {[row.doors.siteLive && 'website', row.doors.digest && 'morning email', row.doors.insurance && 'insurance'].filter(Boolean).join(' · ') || 'none yet'}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Last staff sign-in: {row.lastStaffSignInAt ? shortDate(row.lastStaffSignInAt) : 'never'}
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
                  <span className="font-mono-num tabular-nums text-xs">{shortDate(at)}</span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </article>
  )
}

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KpiStat label="In their first month" value={board.counts.inFirstMonth} />
        <KpiStat label="Stuck right now" value={board.counts.stuck} tone={board.counts.stuck > 0 ? 'warn' : 'ok'} />
        <KpiStat label="No data connected" value={board.counts.noData} tone={board.counts.noData > 0 ? 'warn' : 'ok'} />
      </div>

      {board.rows.length === 0 ? (
        <EmptyState title="No clinics yet" body="The first signup will show up here with its day count, its goal and what it still needs." />
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
