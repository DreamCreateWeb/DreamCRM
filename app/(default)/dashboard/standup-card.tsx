import Link from 'next/link'
import type { WeeklyStandup } from '@/lib/services/standup'

/**
 * THE WEEKLY STANDUP CARD (Transformation Phase 2 — the Narrator, in-app).
 * "Here's what I got done last week" — counts as chips, up to three stories
 * with names in them, and the only-you list. Pure display; the ledger did
 * the remembering. Hidden entirely on a quiet week (celebrating zero
 * teaches people to stop reading).
 */
export default function StandupCard({ standup }: { standup: WeeklyStandup }) {
  if (standup.totalActions === 0) return null
  const human: string[] = []
  if (standup.humanTasks.openProposals > 0) {
    human.push(
      standup.humanTasks.openProposals === 1
        ? '1 approval is waiting above'
        : `${standup.humanTasks.openProposals} approvals are waiting above`,
    )
  }
  if (standup.humanTasks.followupsDue > 0) {
    human.push(
      standup.humanTasks.followupsDue === 1 ? '1 follow-up is due' : `${standup.humanTasks.followupsDue} follow-ups are due`,
    )
  }

  return (
    <section className="mb-8" aria-label="Your week in review">
      <div className="rounded-[var(--r-lg)] border border-[color:var(--color-hairline)] bg-white dark:bg-gray-800 p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            What I got done last week
            <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">{standup.weekLabel}</span>
          </h2>
          {(standup.newPatientsSeated > 0 || standup.reviewsReceived > 0) && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {[
                standup.newPatientsSeated > 0
                  ? `${standup.newPatientsSeated} new ${standup.newPatientsSeated === 1 ? 'patient' : 'patients'} seated`
                  : null,
                standup.reviewsReceived > 0
                  ? `${standup.reviewsReceived} new ${standup.reviewsReceived === 1 ? 'review' : 'reviews'}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>

        <ul className="mt-3 flex flex-wrap gap-2">
          {standup.lines.slice(0, 8).map((l) => (
            <li
              key={l.capability}
              className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-200 tabular-nums"
            >
              {l.count} {l.noun}
            </li>
          ))}
        </ul>

        {standup.stories.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {standup.stories.map((s, i) => (
              <li key={i} className="text-sm text-gray-700 dark:text-gray-200 flex gap-2">
                <span aria-hidden="true" className="text-gray-400 dark:text-gray-500">
                  —
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {human.length > 0 ? (
            <>Only you can do: {human.join(', and ')}.</>
          ) : (
            <>Nothing is waiting on you from last week.</>
          )}{' '}
          <Link href="/followups" className="underline hover:no-underline">
            Follow-ups
          </Link>
        </p>
      </div>
    </section>
  )
}
