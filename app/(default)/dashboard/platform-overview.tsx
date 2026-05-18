import Link from 'next/link'
import { getProjectStats, getSubscriptionStats } from '@/lib/services/projects'
import {
  AGENCY_PROJECT_TYPE_LABELS,
  AGENCY_PROJECT_STATUS_LABELS,
  type AgencyProjectStatus,
  type AgencyProjectType,
} from '@/lib/db/schema/platform'
import { formatMoneyShort, formatNumberShort, formatRelativeDate } from '@/lib/utils/format'

const TYPE_ICONS: Record<AgencyProjectType, string> = {
  website: '🌐',
  ecommerce: '🛒',
  intake_form: '📝',
  videography: '🎥',
  photography: '📸',
  content: '✍️',
  other: '📦',
}

const PIPELINE_STAGES: AgencyProjectStatus[] = ['lead', 'discovery', 'in_progress', 'review', 'completed']
const STAGE_COLORS: Record<AgencyProjectStatus, string> = {
  lead: 'bg-gray-500/20 text-gray-700 dark:text-gray-300',
  discovery: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  in_progress: 'bg-violet-500/20 text-violet-700 dark:text-violet-400',
  review: 'bg-sky-500/20 text-sky-700 dark:text-sky-400',
  completed: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  on_hold: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  cancelled: 'bg-red-500/20 text-red-700 dark:text-red-400',
}

export default async function PlatformOverview() {
  const [subs, projects] = await Promise.all([getSubscriptionStats(), getProjectStats()])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Agency Overview
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Recurring revenue, active engagements, and project pipeline.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/ecommerce/customers"
            className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
          >
            View clinics
          </Link>
          <Link
            href="/ecommerce/invoices"
            className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
          >
            Subscriptions
          </Link>
        </div>
      </div>

      {/* Top-line KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Kpi label="Active Clinics" value={formatNumberShort(subs.activeClinics)} hint={`${subs.newClinics30d} new in 30d`} />
        <Kpi label="MRR" value={formatMoneyShort(subs.monthlyRecurringCents)} hint="Subscriptions only" />
        <Kpi label="Open Projects" value={formatNumberShort(projects.openProjects)} hint={`${projects.totalProjects} total`} />
        <Kpi label="Pipeline Value" value={formatMoneyShort(projects.pipelineValueCents)} hint="Open project budgets" />
      </div>

      {/* Subscriptions breakdown + Service mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
            Subscriptions by Plan
          </h2>
          <ul className="space-y-3">
            <PlanRow label="Basic ($99/mo)" count={subs.byTier.basic} total={subs.activeClinics} color="bg-gray-400" />
            <PlanRow label="Pro ($149/mo)" count={subs.byTier.pro} total={subs.activeClinics} color="bg-sky-500" />
            <PlanRow label="Premium ($199/mo)" count={subs.byTier.premium} total={subs.activeClinics} color="bg-violet-500" />
          </ul>
          {subs.activeClinics === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-4">
              No paid clinics yet. The first one will show up here once their Stripe Checkout completes.
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
            Service Mix
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(Object.entries(projects.byType) as Array<[AgencyProjectType, number]>).map(([type, count]) => (
              <div
                key={type}
                className="flex items-center gap-3 p-3 border border-gray-100 dark:border-gray-700/60 rounded-lg"
              >
                <span className="text-2xl">{TYPE_ICONS[type]}</span>
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {AGENCY_PROJECT_TYPE_LABELS[type]}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {count} {count === 1 ? 'project' : 'projects'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Project Pipeline
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {PIPELINE_STAGES.map((stage) => (
            <div
              key={stage}
              className="p-4 rounded-lg border border-gray-100 dark:border-gray-700/60"
            >
              <div className={`inline-block text-xs font-semibold px-2 py-1 rounded-full mb-2 ${STAGE_COLORS[stage]}`}>
                {AGENCY_PROJECT_STATUS_LABELS[stage]}
              </div>
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                {projects.byStatus[stage]}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Recent Project Activity
          </h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {projects.completedThisMonth} completed this month
          </span>
        </div>
        {projects.recentlyUpdated.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-8">
            No projects logged yet. The Projects module will let you add ecommerce builds,
            intake forms, videography, and photography engagements per clinic.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {projects.recentlyUpdated.map((p) => (
              <li key={p.id} className="flex items-center gap-4 py-3">
                <span className="text-xl shrink-0">{TYPE_ICONS[p.type as AgencyProjectType] ?? '📦'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 dark:text-gray-100 truncate">{p.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {p.clinicName ?? 'Internal'} · {AGENCY_PROJECT_TYPE_LABELS[p.type as AgencyProjectType]}
                  </div>
                </div>
                <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${STAGE_COLORS[p.status as AgencyProjectStatus]}`}>
                  {AGENCY_PROJECT_STATUS_LABELS[p.status as AgencyProjectStatus]}
                </span>
                <span className="shrink-0 text-xs text-gray-400 hidden sm:inline">
                  {formatRelativeDate(p.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-5 py-4">
      <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{value}</div>
      {hint && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</div>}
    </div>
  )
}

function PlanRow({
  label,
  count,
  total,
  color,
}: {
  label: string
  count: number
  total: number
  color: string
}) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100)
  return (
    <li>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-700 dark:text-gray-200">{label}</span>
        <span className="font-medium text-gray-800 dark:text-gray-100">
          {count} <span className="text-gray-400 dark:text-gray-500 text-xs">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-700/60 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  )
}
