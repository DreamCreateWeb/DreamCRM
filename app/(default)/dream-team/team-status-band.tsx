import Link from 'next/link'

/**
 * THE PAGE'S OPENING BEAT (docs/ai-operations.md, D7) — "your team worked
 * while you were closed."
 *
 * Why it exists: the Dream Team page opened straight onto a demanding
 * surface (the sign-here stack) or, on a calm day, onto nothing much at
 * all. Neither answers the question a person actually arrives with — *is
 * anything happening?* This band answers it in one glance with three real
 * numbers and then gets out of the way.
 *
 * Design contract:
 *  - CHROME, not data: it sits in the page-header zone, so the soft
 *    dream-blue wash and the two floating bubbles are allowed here and
 *    nowhere below (DESIGN-SYSTEM §2.4).
 *  - Every number is REAL and every number is a place: waiting and staged
 *    jump to their sections. "Handled last week" is a plain stat because
 *    there is no ledger page to send anyone to — a link to nothing is worse
 *    than no link.
 *  - Zero is said plainly. A quiet week must never be dressed up, and the
 *    live dot means "the team is on the clock", not "the team was busy".
 */
export interface TeamStatusBandData {
  /** Cards waiting on a human yes right now. */
  waiting: number
  /** Pieces staged on the veto runway (D4). */
  staged: number
  /** Things the team handled in the prior clinic week (the standup's total). */
  handledLastWeek: number
  /** e.g. "May 10 – May 16" — the window the number covers. Null if unknown. */
  weekLabel: string | null
  /** Goals currently pointing the team somewhere. */
  activeGoals: number
  /** CYCLES (D7d): how long ago the last pass ran, already in words. Null
   *  when no pass has stamped yet — the band says so rather than implying
   *  one happened. */
  lastCycle?: string | null
}

function Stat({
  value,
  label,
  href,
  tone,
}: {
  value: number
  label: string
  href?: string
  tone: 'warn' | 'neutral' | 'ok'
}) {
  const valueTone =
    value === 0
      ? 'text-gray-400 dark:text-gray-500'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'ok'
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-gray-900 dark:text-gray-100'
  const inner = (
    <>
      <span className={`block font-mono-num text-2xl font-bold tabular-nums ${valueTone}`}>
        {value}
      </span>
      <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{label}</span>
    </>
  )
  // A number with nowhere to go stays plain text — a dead link reads as a
  // broken page, and only two of these three have a section to land on.
  if (!href || value === 0) return <div className="min-w-[5.5rem]">{inner}</div>
  return (
    <Link
      href={href}
      className="min-w-[5.5rem] rounded-[var(--r-sm)] transition-colors hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:text-teal-300"
    >
      {inner}
    </Link>
  )
}

export default function TeamStatusBand({
  waiting,
  staged,
  handledLastWeek,
  weekLabel,
  activeGoals,
  lastCycle = null,
}: TeamStatusBandData) {
  const headline =
    waiting > 0
      ? waiting === 1
        ? 'One thing is finished and waiting on you.'
        : `${waiting} things are finished and waiting on you.`
      : staged > 0
        ? 'Nothing needs you — work is queued and going out.'
        : 'Nothing needs you right now.'

  return (
    <section className="relative mb-6 overflow-hidden rounded-[var(--r-lg)] bg-[linear-gradient(105deg,rgb(76_125_240/.08),rgb(20_184_166/.06)_55%,transparent)] px-5 py-5 sm:px-6">
      {/* Decorative bubbles — chrome-zone only, pointer-events off. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-teal-400/10 blur-[2px]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 right-24 hidden h-28 w-28 rounded-full bg-teal-400/[.07] sm:block"
      />

      <div className="relative flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-2xl shadow-[var(--shadow-xs)] dark:bg-white/10"
          >
            🌙
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
              />
              On the clock
              <span className="font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400">
                {/* The name has to earn itself: "on the clock" is decoration
                    until a person can see the clock ticking. */}
                {lastCycle ? `· last cycle ${lastCycle}` : '· first cycle hasn’t run yet'}
              </span>
            </p>
            <p className="mt-1 text-base font-bold tracking-tight text-gray-900 dark:text-gray-100">
              {headline}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {activeGoals > 0
                ? `Pointed at ${activeGoals === 1 ? 'your goal' : `your ${activeGoals} goals`} below.`
                : 'Tell them what you want more of below and they’ll aim there.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <Stat value={waiting} label="waiting on you" href="#sign-here" tone="warn" />
          <Stat value={staged} label="going out soon" href="#going-out-soon" tone="neutral" />
          <Stat
            value={handledLastWeek}
            label={weekLabel ? `handled ${weekLabel}` : 'handled last week'}
            tone="ok"
          />
        </div>
      </div>
    </section>
  )
}
