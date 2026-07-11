import Link from 'next/link'
import type { MomentumMetric, PipelineMomentum } from '@/lib/services/prospecting'

/**
 * "This week" — the machine's FLOW, week over week. Where the board is a
 * snapshot and the briefing is today's to-do, this strip answers "are we
 * building momentum?" Each metric shows the trailing-7-day count with a
 * delta chip vs the 7 days before it, and links to the record behind it.
 */

interface Metric {
  key: keyof PipelineMomentum
  label: string
  icon: string
  /** Higher-is-better metrics get green up-arrows; all four here are. */
  accent: string
  /** Tinted circle behind the icon — same language as the cockpit stages. */
  iconBg: string
  /** Where the number's record lives — the strip doubles as a launchpad. */
  href: string
}
const METRICS: Metric[] = [
  { key: 'reachedOut', label: 'Reached out', icon: '📣', accent: 'text-gray-800 dark:text-gray-100', iconBg: 'bg-[color:var(--color-surface-sunk)]', href: '/platform/prospecting/communications' },
  { key: 'replies', label: 'Replies', icon: '💬', accent: 'text-sky-600 dark:text-sky-400', iconBg: 'bg-sky-500/10', href: '/platform/prospecting/communications' },
  { key: 'demosBooked', label: 'Demos booked', icon: '📅', accent: 'text-violet-600 dark:text-violet-400', iconBg: 'bg-violet-500/10', href: '/platform/prospecting/demos' },
  { key: 'won', label: 'Won', icon: '🏆', accent: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-500/10', href: '/platform/prospecting?view=prospects&status=converted' },
]

function Delta({ m }: { m: MomentumMetric }) {
  const diff = m.now - m.prev
  if (m.prev === 0 && m.now === 0) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
  }
  if (diff === 0) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">± vs last wk</span>
  }
  const up = diff > 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
      }`}
      title={`${m.prev} the previous 7 days`}
    >
      {up ? '▲' : '▼'} {Math.abs(diff)} vs last wk
    </span>
  )
}

export default function MomentumStrip({ momentum }: { momentum: PipelineMomentum }) {
  return (
    <div className="rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] ring-1 ring-[color:var(--color-hairline)]">
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          This week
        </h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">· trailing 7 days</span>
      </div>
      <div className="grid grid-cols-2 divide-y divide-[color:var(--color-hairline)] sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
        {METRICS.map((mt) => {
          const m = momentum[mt.key]
          return (
            <Link
              key={mt.key}
              href={mt.href}
              className="group flex items-center gap-3 px-4 py-3 transition hover:bg-[color:var(--color-surface-sunk)]"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${mt.iconBg}`}
                aria-hidden="true"
              >
                {mt.icon}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-medium text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-200">
                  {mt.label}
                </span>
                <span className={`font-mono-num text-[1.6rem] font-extrabold leading-none ${mt.accent}`}>
                  {m.now.toLocaleString()}
                </span>
                <Delta m={m} />
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
