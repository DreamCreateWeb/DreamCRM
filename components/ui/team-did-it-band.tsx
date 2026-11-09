import Link from 'next/link'
import { TONE_TEXT } from '@/lib/ui/encodings'
import type { TeamDidIt } from '@/lib/services/team-did-it'

/**
 * THE QUIET BAND ABOVE THE MANUAL CONTROLS (ML-36, G3-15). A Growth page says
 * what the Dream Team already did before it offers a lever — "the employee,
 * not the tool". Renders NOTHING when the team has neither done nor drafted
 * anything for this page's lanes (a quiet week never looks busy), and the
 * page's own controls stay exactly where they were beneath it.
 *
 * `what` is the page's noun for the work ("review requests", "campaigns") so
 * the sentence reads in the page's own language.
 */
export function TeamDidItBand({
  data,
  what,
}: {
  data: TeamDidIt | null
  what: { one: string; many: string }
}) {
  if (!data || (data.open === 0 && data.doneThisWeek === 0)) return null
  const noun = (n: number) => (n === 1 ? what.one : what.many)
  const waiting = data.open > 0
  return (
    <section
      aria-label="What the Dream Team already did"
      data-testid="team-did-it"
      data-state={waiting ? 'waiting' : 'done'}
      className="v2-card mb-6 px-5 py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {waiting ? (
            <>
              The team has {data.open} {noun(data.open)} ready for you — {data.open === 1 ? 'it’s' : 'they’re'} waiting on your yes.
            </>
          ) : (
            <>
              The Dream Team handled {data.doneThisWeek} {noun(data.doneThisWeek)} this week — nothing for you to do here.
            </>
          )}
        </p>
        {waiting && data.doneThisWeek > 0 && (
          <p className={`mt-0.5 text-xs ${TONE_TEXT.ok}`}>
            And handled {data.doneThisWeek} {noun(data.doneThisWeek)} on its own this week.
          </p>
        )}
        {data.lastLine && (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">Latest: {data.lastLine}</p>
        )}
      </div>
      <Link
        href="/dream-team"
        className="text-sm font-medium text-gray-700 dark:text-gray-200 underline underline-offset-4 whitespace-nowrap"
      >
        {waiting ? 'See what’s waiting' : 'See the Dream Team’s week'}
      </Link>
    </section>
  )
}
