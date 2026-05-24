import Link from 'next/link'
import {
  getClinicGrowth,
  getMrrSnapshot,
  getChurnStats,
  getProjectVelocity,
  getProjectFunnel,
  getPlatformEngagement,
} from '@/lib/services/platform-metrics'
import { getProjectStats } from '@/lib/services/projects'
import {
  AGENCY_PROJECT_TYPE_LABELS,
  type AgencyProjectType,
} from '@/lib/db/schema/platform'
import { formatMoneyShort, formatNumberShort } from '@/lib/utils/format'
import Sparkline from '@/components/ui/sparkline'

const TYPE_ICONS: Record<AgencyProjectType, string> = {
  website: '🌐',
  ecommerce: '🛒',
  intake_form: '📝',
  videography: '🎥',
  photography: '📸',
  content: '✍️',
  other: '📦',
}

export default async function PlatformMetrics() {
  const [growth, mrr, churn, velocity, funnel, engagement, projectStats] = await Promise.all([
    getClinicGrowth(12),
    getMrrSnapshot(),
    getChurnStats(),
    getProjectVelocity(6),
    getProjectFunnel(),
    getPlatformEngagement(),
    getProjectStats(),
  ])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Platform Metrics
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Health ratios, growth trends, and project performance across Dream Create.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard"
            className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
          >
            ← Overview
          </Link>
          <Link
            href="/dashboard/fintech"
            className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
          >
            Revenue $
          </Link>
        </div>
      </div>

      {/* ── Health ratios ── focus is RATES, not absolute money values
            (those are owned by the Revenue module) ───────────────────── */}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
        Health Ratios
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat
          label="Churn Rate (30d)"
          value={`${churn.approxChurnRate30d.toFixed(1)}%`}
          hint={`${churn.canceled30d} canceled · ${churn.pastDue} past due`}
          tone={churn.approxChurnRate30d > 5 ? 'warn' : 'default'}
        />
        <Stat
          label="ARPU"
          value={mrr.activeClinics === 0 ? '—' : formatMoneyShort(mrr.arpu)}
          hint={`Average per clinic · ${mrr.activeClinics} active`}
        />
        <Stat
          label="Completion Rate"
          value={`${funnel.overallCompletionRate.toFixed(1)}%`}
          hint={`${funnel.reachedCompleted} of ${funnel.totalCreated} delivered`}
        />
        <Stat
          label="Avg Project Duration"
          value={velocity.avgDurationDays == null ? '—' : `${velocity.avgDurationDays}d`}
          hint="Start → completion"
        />
      </div>

      {/* ── Subscription mix ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Subscription Mix
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {mrr.activeClinics} active subscribers · {formatMoneyShort(mrr.monthlyRecurringCents)} MRR
          </span>
        </div>
        {mrr.activeClinics === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-6">
            No active subscriptions yet.
          </p>
        ) : (
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700/60 mb-4">
            <div
              className="bg-gray-400"
              style={{ width: `${(mrr.byTier.basic / mrr.activeClinics) * 100}%` }}
              title={`Basic: ${mrr.byTier.basic}`}
            />
            <div
              className="bg-sky-500"
              style={{ width: `${(mrr.byTier.pro / mrr.activeClinics) * 100}%` }}
              title={`Pro: ${mrr.byTier.pro}`}
            />
            <div
              className="bg-violet-500"
              style={{ width: `${(mrr.byTier.premium / mrr.activeClinics) * 100}%` }}
              title={`Premium: ${mrr.byTier.premium}`}
            />
          </div>
        )}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <PlanCell tier="Basic" count={mrr.byTier.basic} price="$99" color="bg-gray-400" />
          <PlanCell tier="Pro" count={mrr.byTier.pro} price="$149" color="bg-sky-500" />
          <PlanCell tier="Premium" count={mrr.byTier.premium} price="$199" color="bg-violet-500" />
        </div>
        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
          Based on clinic plan assignments (synced from Stripe via webhook). For
          live billing — actual charges, trials, and past-due — see{' '}
          <a href="/ecommerce/invoices" className="underline hover:text-gray-600 dark:hover:text-gray-300">Subscriptions</a>.
        </p>
      </div>

      {/* ── Service mix — what kinds of project work do we sell? ─────── */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Service Mix
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {projectStats.totalProjects} total projects
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {(Object.entries(projectStats.byType) as Array<[AgencyProjectType, number]>).map(
            ([type, count]) => (
              <div
                key={type}
                className="flex flex-col items-center text-center gap-1 p-3 border border-gray-100 dark:border-gray-700/60 rounded-lg"
              >
                <span className="text-2xl">{TYPE_ICONS[type]}</span>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {AGENCY_PROJECT_TYPE_LABELS[type]}
                </div>
                <div className="text-base font-semibold text-gray-800 dark:text-gray-100">
                  {count}
                </div>
              </div>
            ),
          )}
        </div>
      </div>

      {/* ── Clinic growth ───────────────────────────────────────────── */}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
        Growth
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
              New Clinics — last 12 weeks
            </h3>
            <TrendBadge value={growth.pctChange} />
          </div>
          <div className="mt-3">
            <Sparkline data={growth.buckets} variant="bar" color="#8b5cf6" width={760} height={120} />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
            <div>
              <div className="text-gray-500 dark:text-gray-400">This week</div>
              <div className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {growth.newThisWeek}
              </div>
            </div>
            <div>
              <div className="text-gray-500 dark:text-gray-400">Last week</div>
              <div className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {growth.newPrevWeek}
              </div>
            </div>
            <div>
              <div className="text-gray-500 dark:text-gray-400">All-time</div>
              <div className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {growth.total}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">Health</h3>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">Total clinics</span>
              <span className="font-semibold text-gray-800 dark:text-gray-100">
                {growth.total}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">Active subs</span>
              <span className="font-semibold text-gray-800 dark:text-gray-100">
                {mrr.activeClinics}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">Past due</span>
              <span
                className={`font-semibold ${churn.pastDue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'}`}
              >
                {churn.pastDue}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">Canceled (30d)</span>
              <span
                className={`font-semibold ${churn.canceled30d > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}
              >
                {churn.canceled30d}
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* ── Project performance ────────────────────────────────────── */}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
        Project Performance
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Completed Projects — last 6 months
            </h3>
            <TrendBadge value={velocity.pctChange} />
          </div>
          <div className="mt-3">
            <Sparkline data={velocity.buckets} variant="line" color="#10b981" width={760} height={120} />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
            <div>
              <div className="text-gray-500 dark:text-gray-400">This month</div>
              <div className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {velocity.completedThisMonth}
              </div>
            </div>
            <div>
              <div className="text-gray-500 dark:text-gray-400">Last month</div>
              <div className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {velocity.completedLastMonth}
              </div>
            </div>
            <div>
              <div className="text-gray-500 dark:text-gray-400">Avg duration</div>
              <div className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {velocity.avgDurationDays == null ? '—' : `${velocity.avgDurationDays}d`}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">Funnel</h3>
          {funnel.totalCreated === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No projects logged yet.
            </p>
          ) : (
            <>
              <FunnelRow label="Created" count={funnel.totalCreated} max={funnel.totalCreated} />
              <FunnelRow label="Discovery+" count={funnel.reachedDiscovery} max={funnel.totalCreated} />
              <FunnelRow label="In progress+" count={funnel.reachedInProgress} max={funnel.totalCreated} />
              <FunnelRow label="Review+" count={funnel.reachedReview} max={funnel.totalCreated} />
              <FunnelRow label="Completed" count={funnel.reachedCompleted} max={funnel.totalCreated} />
              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/60 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Completion rate</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-100">
                    {funnel.overallCompletionRate.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-gray-500 dark:text-gray-400">Loss rate</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-100">
                    {funnel.lossRate.toFixed(1)}%
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Engagement ─────────────────────────────────────────────── */}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
        Engagement
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat
          label="Total Patients"
          value={formatNumberShort(engagement.totalPatients)}
          hint="All clinics"
        />
        <Stat
          label="New Patients (30d)"
          value={formatNumberShort(engagement.newPatients30d)}
          hint="Across all clinics"
        />
        <Stat
          label="Appointments (30d)"
          value={formatNumberShort(engagement.appointmentsBooked30d)}
          hint="Booked in last 30 days"
        />
        <Stat
          label="Appointments (7d)"
          value={formatNumberShort(engagement.appointmentsBooked7d)}
          hint="Booked in last 7 days"
        />
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'warn'
}) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-5 py-4">
      <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-1">
        {label}
      </div>
      <div
        className={`text-2xl font-bold ${tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'}`}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</div>}
    </div>
  )
}

function PlanCell({
  tier,
  count,
  price,
  color,
}: {
  tier: string
  count: number
  price: string
  color: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-gray-700 dark:text-gray-200">
        {tier} <span className="text-gray-400 dark:text-gray-500">{price}</span>
      </span>
      <span className="ml-auto font-semibold text-gray-800 dark:text-gray-100">{count}</span>
    </div>
  )
}

function TrendBadge({ value }: { value: number | null }) {
  if (value == null) return null
  const sign = value >= 0 ? '+' : ''
  const cls =
    value > 0
      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
      : value < 0
        ? 'bg-red-500/20 text-red-700 dark:text-red-400'
        : 'bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300'
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {sign}
      {value.toFixed(1)}% wow
    </span>
  )
}

function FunnelRow({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max === 0 ? 0 : (count / max) * 100
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-700 dark:text-gray-200">{label}</span>
        <span className="text-gray-500 dark:text-gray-400">
          {count} <span className="text-gray-400">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-700/60 rounded-full overflow-hidden">
        <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
