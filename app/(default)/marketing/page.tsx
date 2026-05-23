import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { marketingTerminology, stageAccentClasses } from '@/lib/marketing/terminology'
import {
  getFunnel,
  getPipelineCounts,
  listAudiences,
  listRecentActivity,
} from '@/lib/services/marketing'
import { listCampaigns } from '@/lib/services/campaigns'
import { getSubscriptionStats } from '@/lib/services/projects'
import { formatMoneyShort, formatNumberShort, formatRelativeDate } from '@/lib/utils/format'
import ClinicRecallDashboard from './clinic-recall-dashboard'

export const metadata = {
  title: 'Marketing - DreamCRM',
  description: 'Pipeline, campaigns, audiences',
}

export const dynamic = 'force-dynamic'

export default async function MarketingDashboard() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  // Clinic tenants get a research-backed recall dashboard (morning-huddle
  // pattern matching /dashboard). Platform tenants keep the SaaS pipeline
  // funnel — the same data layer powers both, but the surfaces are wildly
  // different by design.
  if (ctx.tenantType === 'clinic') {
    return <ClinicRecallDashboard ctx={ctx} />
  }

  return <PlatformMarketingDashboard ctx={ctx} />
}

// ── Platform tenant: SaaS pipeline funnel (unchanged behavior) ──────

async function PlatformMarketingDashboard({ ctx }: { ctx: Awaited<ReturnType<typeof requireTenant>> }) {
  const t = marketingTerminology(ctx.tenantType)
  const stageKeys = t.stages.map((s) => s.key)

  const [funnel, counts, recent, audiences, campaigns, subs] = await Promise.all([
    getFunnel(ctx.organizationId, stageKeys),
    getPipelineCounts(ctx.organizationId),
    listRecentActivity(ctx.organizationId, 8),
    listAudiences(ctx.organizationId),
    listCampaigns({}).catch(() => []),
    ctx.tenantType === 'platform' ? getSubscriptionStats().catch(() => null) : Promise.resolve(null),
  ])

  const openPipeline = funnel
    .filter((f) => {
      const stage = t.stages.find((s) => s.key === f.stage)
      return !stage?.terminal
    })
    .reduce((sum, f) => sum + f.count, 0)

  const wonCount = funnel
    .filter((f) => t.stages.find((s) => s.key === f.stage)?.terminal === 'won')
    .reduce((sum, f) => sum + f.count, 0)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl text-stone-800 dark:text-stone-100 font-bold tracking-tight">
            {t.moduleTitle}
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Track prospects, run campaigns, grow the platform.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/marketing/audiences"
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:border-stone-300 text-stone-700 dark:text-stone-200"
          >
            Audiences
          </Link>
          <Link
            href="/marketing/campaigns"
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:border-stone-300 text-stone-700 dark:text-stone-200"
          >
            Campaigns
          </Link>
          <Link
            href="/marketing/pipeline"
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900"
          >
            Open Pipeline →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi
          label={`Open ${t.leads}`}
          value={formatNumberShort(openPipeline)}
          hint={`${formatNumberShort(counts.total)} total · ${formatNumberShort(counts.optedOut)} opted out`}
        />
        <Kpi
          label={t.stages.find((s) => s.terminal === 'won')?.label ?? 'Won'}
          value={formatNumberShort(wonCount)}
          hint="All-time"
        />
        <Kpi label="Audiences" value={formatNumberShort(audiences.length)} hint="Saved segments" />
        <Kpi
          label={ctx.tenantType === 'platform' ? 'MRR' : 'Campaigns'}
          value={
            ctx.tenantType === 'platform' && subs
              ? formatMoneyShort(subs.monthlyRecurringCents)
              : formatNumberShort(campaigns.length)
          }
          hint={ctx.tenantType === 'platform' ? 'Active subscriptions' : 'All-time'}
        />
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Funnel</h2>
          <Link
            href="/marketing/pipeline"
            className="text-[11px] font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
          >
            Manage pipeline →
          </Link>
        </div>
        <FunnelBars funnel={funnel} stages={t.stages} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-3">
            Recent activity
          </h2>
          {recent.length === 0 ? (
            <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">
              No {t.leads} yet. Head to the pipeline to add one.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-700/40">
              {recent.map((r) => {
                const stage = t.stages.find((s) => s.key === r.pipelineStage)
                const accent = stageAccentClasses(stage?.accent ?? 'stone')
                return (
                  <li key={r.id} className="py-2 flex items-center gap-3">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${accent.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-stone-800 dark:text-stone-100 truncate">
                        {r.name}
                      </p>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                        {r.email}
                      </p>
                    </div>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${accent.bg} ${accent.text}`}>
                      {stage?.label ?? r.pipelineStage}
                    </span>
                    <span
                      className="text-[10px] text-stone-400 dark:text-stone-500 tabular-nums shrink-0"
                      suppressHydrationWarning
                    >
                      {formatRelativeDate(r.lastActivityAt ?? r.createdAt)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Audiences</h2>
            <Link
              href="/marketing/audiences"
              className="text-[11px] font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
            >
              Manage →
            </Link>
          </div>
          {audiences.length === 0 ? (
            <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">
              No saved segments yet. <Link href="/marketing/audiences" className="underline">Create one</Link> to
              slice the pipeline into reusable lists for campaign sends.
            </p>
          ) : (
            <ul className="space-y-2">
              {audiences.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-stone-700 dark:text-stone-200">{a.name}</span>
                  {a.description && (
                    <span className="text-[11px] text-stone-400 dark:text-stone-500 truncate ml-2">
                      {a.description}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
        {label}
      </p>
      <p className="text-xl font-bold text-stone-900 dark:text-stone-100 mt-0.5 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">{hint}</p>}
    </div>
  )
}

function FunnelBars({
  funnel,
  stages,
}: {
  funnel: { stage: string; count: number }[]
  stages: ReturnType<typeof marketingTerminology>['stages']
}) {
  const max = Math.max(1, ...funnel.map((f) => f.count))
  return (
    <div className="space-y-2">
      {funnel.map((f) => {
        const stage = stages.find((s) => s.key === f.stage)
        const accent = stageAccentClasses(stage?.accent ?? 'stone')
        const pct = (f.count / max) * 100
        return (
          <div key={f.stage} className="flex items-center gap-3">
            <div className="w-32 text-[12px] font-medium text-stone-700 dark:text-stone-200 shrink-0">
              {stage?.label ?? f.stage}
            </div>
            <div className="flex-1 h-6 bg-stone-100 dark:bg-stone-800 rounded-md overflow-hidden">
              <div
                className={`h-full ${accent.dot} rounded-md transition-all`}
                style={{ width: `${pct}%`, opacity: 0.85 }}
              />
            </div>
            <div className="w-12 text-right text-[12px] font-semibold text-stone-700 dark:text-stone-200 tabular-nums">
              {f.count}
            </div>
          </div>
        )
      })}
    </div>
  )
}
