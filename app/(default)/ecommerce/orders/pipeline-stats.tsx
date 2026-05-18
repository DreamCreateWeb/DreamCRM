import type { PipelineMetrics } from '@/lib/services/projects'
import { formatMoneyShort, formatNumberShort } from '@/lib/utils/format'

interface Props {
  metrics: PipelineMetrics
}

export default function PipelineStats({ metrics }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        label="Open pipeline value"
        value={formatMoneyShort(metrics.openValueCents)}
        sub={`${metrics.openCount} ${metrics.openCount === 1 ? 'project' : 'projects'} in flight`}
        tone="violet"
      />
      <StatCard
        label="Won (last 90d)"
        value={formatMoneyShort(metrics.wonValueCents90d)}
        sub={`${metrics.wonCount90d} project${metrics.wonCount90d === 1 ? '' : 's'} delivered`}
        tone="emerald"
      />
      <StatCard
        label="Win rate (90d)"
        value={`${metrics.winRatePct}%`}
        sub={metrics.winRatePct === 0 && metrics.wonCount90d === 0 ? 'No closes yet' : 'Of closed projects'}
        tone={metrics.winRatePct >= 70 ? 'emerald' : metrics.winRatePct >= 40 ? 'violet' : 'amber'}
      />
      <StatCard
        label="Needs attention"
        value={formatNumberShort(metrics.overdueCount)}
        sub={metrics.overdueCount > 0 ? 'Past their due date' : 'Nothing overdue'}
        tone={metrics.overdueCount > 0 ? 'red' : 'gray'}
      />
    </div>
  )
}

const TONE_CLASSES = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  violet: 'text-violet-600 dark:text-violet-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
  gray: 'text-gray-800 dark:text-gray-100',
} as const

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone: keyof typeof TONE_CLASSES
}) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-5 py-4">
      <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${TONE_CLASSES[tone]}`}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</p>
    </div>
  )
}
