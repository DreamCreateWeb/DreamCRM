import type { PipelineMetrics } from '@/lib/services/projects'
import { formatMoneyShort, formatNumberShort } from '@/lib/utils/format'
import { KpiStat } from '@/components/ui/kpi-stat'

interface Props {
  metrics: PipelineMetrics
}

export default function PipelineStats({ metrics }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <KpiStat
        label="Open pipeline value"
        value={formatMoneyShort(metrics.openValueCents)}
        sub={`${metrics.openCount} ${metrics.openCount === 1 ? 'project' : 'projects'} in flight`}
      />
      <KpiStat
        label="Won (last 90d)"
        value={formatMoneyShort(metrics.wonValueCents90d)}
        sub={`${metrics.wonCount90d} project${metrics.wonCount90d === 1 ? '' : 's'} delivered`}
      />
      <KpiStat
        label="Win rate (90d)"
        value={`${metrics.winRatePct}%`}
        sub={metrics.winRatePct === 0 && metrics.wonCount90d === 0 ? 'No closes yet' : 'Of closed projects'}
        tone={metrics.winRatePct >= 40 ? 'ok' : 'warn'}
      />
      <KpiStat
        label="Needs attention"
        value={formatNumberShort(metrics.overdueCount)}
        sub={metrics.overdueCount > 0 ? 'Past their due date' : 'Nothing overdue'}
        tone={metrics.overdueCount > 0 ? 'warn' : undefined}
      />
    </div>
  )
}
