import type { MomentumMetric, PipelineMomentum } from '@/lib/services/prospecting'

/**
 * "This week" — the machine's FLOW, week over week. Where the board is a
 * snapshot and the briefing is today's to-do, this strip answers "are we
 * building momentum?" Each metric shows the trailing-7-day count with a
 * delta chip vs the 7 days before it.
 */

interface Metric {
  key: keyof PipelineMomentum
  label: string
  icon: string
  /** Higher-is-better metrics get green up-arrows; all four here are. */
  accent: string
}
const METRICS: Metric[] = [
  { key: 'reachedOut', label: 'Reached out', icon: '📣', accent: 'text-gray-800 dark:text-gray-100' },
  { key: 'replies', label: 'Replies', icon: '💬', accent: 'text-sky-600 dark:text-sky-400' },
  { key: 'demosBooked', label: 'Demos booked', icon: '📅', accent: 'text-violet-600 dark:text-violet-400' },
  { key: 'won', label: 'Won', icon: '🏆', accent: 'text-emerald-600 dark:text-emerald-400' },
]

function Delta({ m }: { m: MomentumMetric }) {
  const diff = m.now - m.prev
  if (m.prev === 0 && m.now === 0) {
    return <span className="text-[0.7rem] text-gray-400 dark:text-gray-500">—</span>
  }
  if (diff === 0) {
    return <span className="text-[0.7rem] text-gray-400 dark:text-gray-500">± vs last wk</span>
  }
  const up = diff > 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[0.7rem] font-semibold tabular-nums ${
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
        <span className="text-[0.7rem] text-gray-400 dark:text-gray-500">· trailing 7 days</span>
      </div>
      <div className="grid grid-cols-2 divide-y divide-[color:var(--color-hairline)] sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
        {METRICS.map((mt) => {
          const m = momentum[mt.key]
          return (
            <div key={mt.key} className="flex flex-col gap-1 px-4 py-3">
              <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                <span aria-hidden="true">{mt.icon}</span>
                {mt.label}
              </span>
              <span className={`font-mono-num text-3xl font-bold leading-none ${mt.accent}`}>
                {m.now.toLocaleString()}
              </span>
              <Delta m={m} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
