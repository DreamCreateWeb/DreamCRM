import Link from 'next/link'
import type { DailyBriefing } from '@/lib/services/prospecting-briefing'
import { INTENT_SIGNAL_LABELS, type ProspectIntentSignal } from '@/lib/types/prospecting'
import { followUpDueLabel } from '@/lib/prospect-followup'

/**
 * The morning cockpit hero — the first thing on the prospecting home. A single
 * clear next action, then glanceable columns: today's demos, who to call
 * first (with why), the phone-first queue, and what came in overnight. Built
 * to answer "what do I do right now?" in one look.
 */
export default function DailyBriefing({ briefing }: { briefing: DailyBriefing }) {
  const { nextAction, todaysDemos, dueFollowUps, callFirst, phoneQueueTop, overnightHot } = briefing
  const now = new Date()

  return (
    <section className="mb-6">
      <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Today
      </h2>
      {/* The one clear next action — the hero band, same gradient language as
          Call Mode's dial block. */}
      <div className="mb-3 flex flex-wrap items-center gap-4 rounded-[var(--r-lg)] bg-gradient-to-br from-teal-700 via-teal-600 to-teal-500 px-5 py-4 text-white shadow-sm">
        <div className="text-3xl leading-none" aria-hidden="true">
          {nextAction.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-bold">{nextAction.headline}</div>
          <div className="text-sm text-teal-50/80">{nextAction.sub}</div>
        </div>
        <Link
          href={nextAction.href}
          className="shrink-0 rounded-full bg-white px-5 py-2 text-sm font-bold text-teal-700 transition hover:bg-teal-50"
        >
          Let’s go →
        </Link>
      </div>

      {/* Follow-ups you committed to — surfaced prominently so nothing drops */}
      {briefing.dueFollowUpTotal > 0 && (
        <div className="v2-card p-4 mb-3 border-l-4 border-amber-400">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              ⏰ Follow-ups due <span className="text-gray-400">· {briefing.dueFollowUpTotal}</span>
            </span>
            <Link href="/platform/prospecting/call-list" className="text-xs text-teal-600 dark:text-teal-400 hover:underline">
              Open call list →
            </Link>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
            {dueFollowUps.map((f) => (
              <li key={f.id} className="flex items-baseline justify-between gap-2 text-sm">
                <Link
                  href={`/platform/prospecting?prospect=${f.id}`}
                  scroll={false}
                  className="truncate font-medium text-gray-900 dark:text-gray-100 hover:text-teal-600 dark:hover:text-teal-400"
                >
                  {f.name}
                </Link>
                <span className="shrink-0 text-xs text-amber-700 dark:text-amber-400">
                  {f.reason ? `${f.reason} · ` : ''}
                  {followUpDueLabel(f.nextFollowUpAt, now)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Glanceable columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <BriefColumn title="📅 Demos today" count={todaysDemos.length} href="/platform/prospecting/call-list">
          {todaysDemos.length === 0 ? (
            <Empty>Nothing booked today.</Empty>
          ) : (
            todaysDemos.map((d) => (
              <Row key={d.prospectId} href={`/platform/prospecting?prospect=${d.prospectId}`} name={d.name} meta={d.when} />
            ))
          )}
        </BriefColumn>

        <BriefColumn title="🔥 Call first" count={briefing.callListTotal} href="/platform/prospecting/call-list">
          {callFirst.length === 0 ? (
            <Empty>No hand-raisers yet.</Empty>
          ) : (
            callFirst.map((c) => (
              <Row
                key={c.id}
                href={`/platform/prospecting/call-list?highlight=${c.id}`}
                name={c.name}
                meta={
                  c.intentSummary ??
                  (c.intentSignal
                    ? INTENT_SIGNAL_LABELS[c.intentSignal as ProspectIntentSignal] ?? c.intentSignal
                    : c.scoreBand === 'hot'
                      ? 'Hot prospect'
                      : '')
                }
              />
            ))
          )}
        </BriefColumn>

        <BriefColumn title="📵 Phone-first" count={briefing.phoneQueueTotal} href="/platform/prospecting/call-list">
          {phoneQueueTop.length === 0 ? (
            <Empty>None right now.</Empty>
          ) : (
            phoneQueueTop.map((p) => (
              <Row
                key={p.id}
                href={`/platform/prospecting?prospect=${p.id}`}
                name={p.name}
                meta={[p.city, p.state].filter(Boolean).join(', ') || 'No email — call them'}
              />
            ))
          )}
        </BriefColumn>

        <BriefColumn title="🎯 New overnight" count={overnightHot.count} href="/platform/prospecting?band=hot">
          {overnightHot.count === 0 ? (
            <Empty>No new hot prospects.</Empty>
          ) : (
            overnightHot.names.map((n, i) => (
              <div key={i} className="truncate py-1 text-sm text-gray-700 dark:text-gray-300">
                {n}
              </div>
            ))
          )}
        </BriefColumn>
      </div>
    </section>
  )
}

function BriefColumn({
  title,
  count,
  href,
  children,
}: {
  title: string
  count: number
  href: string
  children: React.ReactNode
}) {
  return (
    <div className="v2-card p-4">
      <Link href={href} className="mb-2 flex items-center justify-between gap-2 group">
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</span>
        <span className="rounded-full bg-[color:var(--color-surface-sunk)] px-2 py-0.5 font-mono-num text-xs font-bold text-gray-500 group-hover:text-teal-600 dark:text-gray-400 dark:group-hover:text-teal-400">
          {count}
        </span>
      </Link>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function Row({ href, name, meta }: { href: string; name: string; meta: string }) {
  return (
    <Link href={href} scroll={false} className="block py-1 group">
      <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-teal-600 dark:group-hover:text-teal-400">
        {name}
      </div>
      {meta && <div className="truncate text-xs text-gray-500 dark:text-gray-400">{meta}</div>}
    </Link>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-1 text-sm text-gray-400">{children}</div>
}
