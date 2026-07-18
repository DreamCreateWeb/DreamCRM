import type { SubscriptionStats } from '@/lib/services/stripe-admin'
import { formatMoneyShort, formatNumberShort } from '@/lib/utils/format'
import { KpiStat } from '@/components/ui/kpi-stat'

interface Props {
  stats: SubscriptionStats
}

export default function SubscriptionsStats({ stats }: Props) {
  const arrCents = stats.mrrCents * 12
  const attentionCount = stats.pastDue + stats.trialEndingSoon
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <KpiStat
        label="Monthly Recurring Revenue"
        value={formatMoneyShort(stats.mrrCents)}
        sub={`${formatMoneyShort(arrCents)} annualized`}
      />
      <KpiStat
        label="Active subscribers"
        value={formatNumberShort(stats.active + stats.trialing)}
        sub={`${stats.active} paid · ${stats.trialing} trialing`}
      />
      <KpiStat
        label="Needs attention"
        value={formatNumberShort(attentionCount)}
        sub={`${stats.pastDue} past due · ${stats.trialEndingSoon} trial ending`}
        tone={attentionCount > 0 ? 'warn' : undefined}
      />
      <KpiStat
        label="Scheduled to cancel"
        value={formatNumberShort(stats.scheduledCancel)}
        sub={stats.scheduledCancel > 0 ? 'At next renewal' : 'No churn risk flagged'}
        tone={stats.scheduledCancel > 0 ? 'urgent' : undefined}
      />
    </div>
  )
}

export function PlanMixCard({ stats }: { stats: SubscriptionStats }) {
  if (stats.planMix.length === 0) {
    return (
      <div className="v2-card px-5 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No paying subscribers yet. Plan distribution will show up here.
      </div>
    )
  }
  const totalSubs = stats.planMix.reduce((acc, p) => acc + p.count, 0)
  const totalMrr = stats.planMix.reduce((acc, p) => acc + p.mrrCents, 0)
  return (
    <div className="v2-card">
      <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">Plan mix</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Share of {totalSubs} paying / trialing subscribers by product.
        </p>
      </header>
      <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
        {stats.planMix.map((p) => {
          const sharePct = totalMrr > 0 ? Math.round((p.mrrCents / totalMrr) * 100) : 0
          return (
            <li key={p.productName} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="font-medium text-sm text-gray-800 dark:text-gray-100">{p.productName}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  {p.count} {p.count === 1 ? 'sub' : 'subs'} · {formatMoneyShort(p.mrrCents)}/mo
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-700/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 dark:bg-violet-400 rounded-full"
                  style={{ width: `${sharePct}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
