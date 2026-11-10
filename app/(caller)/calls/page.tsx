export const metadata = {
  title: 'Today’s calls — Dream Create',
}

export const dynamic = 'force-dynamic'

import { requireCaller } from '@/lib/auth/context'
import {
  getCallerBooked,
  getCallerLater,
  getCallerQueue,
  getCallerToday,
} from '@/lib/services/prospect-callers'
import { getProspectingConfig } from '@/lib/services/prospecting'
import { formatInZone } from '@/lib/prospect-when'
import { formatProspectPhone } from '@/lib/types/prospecting'
import { KpiStat } from '@/components/ui/kpi-stat'
import { EmptyState } from '@/components/ui/empty-state'
import CallerSession from './caller-session'
import FillQueueButton from './fill-queue-button'

/**
 * THE CALLER'S DAY (P-02). One page: their own numbers for today, the next
 * call (one at a time — the Call Mode pattern, caller-scoped), the callbacks
 * they promised for later, and the demos they booked. Every row on it is a
 * prospect assigned to THIS caller; nothing else exists here.
 */
export default async function CallsPage() {
  const { caller } = await requireCaller({ allowInactive: true })

  if (caller.status === 'archived') {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mb-3 text-3xl" aria-hidden="true">
          📁
        </div>
        <h1 className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">This calling account has been closed</h1>
        <p className="text-sm text-[color:var(--color-ink-600)]">
          Your Dream Create calling account is no longer active. If you think this is a mistake, get in touch with
          your Dream Create contact.
        </p>
      </div>
    )
  }

  const now = new Date()
  const config = await getProspectingConfig()
  const hostTz = config.booking.hostTimeZone
  const [today, queue, later, booked] = await Promise.all([
    getCallerToday(caller, { now, timeZone: hostTz }),
    caller.status === 'active' ? getCallerQueue(caller.id, { now }) : Promise.resolve([]),
    getCallerLater(caller.id, { now }),
    getCallerBooked(caller, { now }),
  ])
  const paused = caller.status !== 'active'

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Dream Create · calling
          </p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Today, {caller.name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            One practice at a time. The number, the script and the outcome keys are all on the card — press a key, the
            next call loads itself.
          </p>
        </div>
        {!paused && <FillQueueButton holding={today.holding} target={today.target} />}
      </div>

      {paused && (
        <div className="mb-6 rounded-[var(--r-md)] bg-amber-500/10 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-500/20 dark:text-amber-200">
          Your calling is paused right now. Your queue is kept; nothing to dial until Dream Create resumes it.
        </div>
      )}

      {/* Today — their own numbers only */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiStat label="In your queue" value={today.queue} sub={`${today.holding} of ${today.target} held`} />
        <KpiStat label="Dials today" value={today.dials} />
        <KpiStat
          label="Reached"
          value={today.reached}
          sub={today.dials > 0 ? `${Math.round((today.reached / today.dials) * 100)}% of dials` : 'no dials yet'}
        />
        <KpiStat
          label="Callbacks due"
          value={today.callbacksDue}
          tone={today.callbacksDue > 0 ? 'warn' : undefined}
          sub={today.callbacksDue > 0 ? 'at the top of your queue' : undefined}
        />
        <KpiStat label="Meetings booked" value={today.meetings} tone={today.meetings > 0 ? 'ok' : undefined} />
      </div>

      {/* The next call */}
      {paused ? null : queue.length === 0 ? (
        <EmptyState
          icon="📞"
          title="Nothing to dial right now"
          body={
            today.holding > 0
              ? 'Everything you hold is a callback promised for later — it comes back to the top of your queue at its time.'
              : 'Your queue is empty. Fill it and the best practices Dream Create has verified land here, one at a time.'
          }
          action={<FillQueueButton holding={today.holding} target={today.target} />}
        />
      ) : (
        <CallerSession items={queue} hostTimeZone={hostTz} />
      )}

      {/* Later: callbacks they promised */}
      {later.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Callbacks you promised
          </h2>
          <ul className="divide-y divide-[color:var(--color-hairline)] rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] ring-1 ring-[color:var(--color-hairline)]">
            {later.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {l.name}
                  {l.phone && (
                    <span className="ml-2 font-mono-num text-xs text-gray-500 dark:text-gray-400">
                      {formatProspectPhone(l.phone)}
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  {formatInZone(l.callbackAt, l.timezone)} their time
                  {l.reason ? ` · ${l.reason}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Booked by them */}
      {booked.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
            🎉 Demos you booked
          </h2>
          <ul className="divide-y divide-[color:var(--color-hairline)] rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] ring-1 ring-[color:var(--color-hairline)]">
            {booked.map((b) => (
              <li key={b.meetingId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-100">{b.name}</span>
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  {formatInZone(b.scheduledAt, b.hostTimeZone)} (Dream Create’s clock)
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
