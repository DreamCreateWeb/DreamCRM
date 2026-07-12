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
import { getSubscriptionStats } from '@/lib/services/projects'
import { formatMoneyShort, formatNumberShort, formatRelativeDate } from '@/lib/utils/format'
import { permanentRedirect } from 'next/navigation'
import ModuleHint from '@/components/onboarding/module-hint'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { KpiStat } from '@/components/ui/kpi-stat'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata = {
  title: 'Marketing - DreamCRM',
  description: 'Pipeline, campaigns, audiences',
}

export const dynamic = 'force-dynamic'

export default async function MarketingDashboard() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  // The clinic recall dashboard moved into the Growth workspace — old links
  // and bookmarks land there permanently. Platform tenants keep the SaaS
  // pipeline funnel here (their "Marketing" module still points at this path).
  if (ctx.tenantType === 'clinic') {
    permanentRedirect('/growth/outreach')
  }

  return <PlatformMarketingDashboard ctx={ctx} />
}

// ── Platform tenant: SaaS pipeline funnel (unchanged behavior) ──────

async function PlatformMarketingDashboard({ ctx }: { ctx: Awaited<ReturnType<typeof requireTenant>> }) {
  const t = marketingTerminology(ctx.tenantType)
  const stageKeys = t.stages.map((s) => s.key)

  const [funnel, counts, recent, audiences, subs] = await Promise.all([
    getFunnel(ctx.organizationId, stageKeys),
    getPipelineCounts(ctx.organizationId),
    listRecentActivity(ctx.organizationId, 8),
    listAudiences(ctx.organizationId),
    getSubscriptionStats().catch(() => null),
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

  const wonLabel = t.stages.find((s) => s.terminal === 'won')?.label ?? 'Won'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <ModuleHint id="marketing" />
      <PageHeader
        eyebrow={`Growth · ${ctx.organizationName}`}
        title={t.moduleTitle}
        subtitle="Track prospects, run campaigns, and grow the platform."
        actions={
          <>
            <ActionButton variant="secondary" href="/growth/audiences">
              Audiences
            </ActionButton>
            <ActionButton variant="secondary" href="/growth/campaigns">
              Campaigns
            </ActionButton>
            <ActionButton variant="primary" breath href="/marketing/pipeline">
              Open pipeline
            </ActionButton>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiStat
          label={`Open ${t.leads}`}
          value={formatNumberShort(openPipeline)}
          sub={`${formatNumberShort(counts.total)} total · ${formatNumberShort(counts.optedOut)} opted out`}
          href="/marketing/pipeline"
        />
        <KpiStat
          label={wonLabel}
          value={formatNumberShort(wonCount)}
          sub="All-time"
          href="/marketing/pipeline"
        />
        <KpiStat
          label="Audiences"
          value={formatNumberShort(audiences.length)}
          sub="Saved segments"
          href="/growth/audiences"
        />
        <KpiStat
          label="MRR"
          value={subs ? formatMoneyShort(subs.monthlyRecurringCents) : '—'}
          sub="Active subscriptions"
          href="/ecommerce/invoices"
        />
      </div>

      <div className="v2-card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Funnel</h2>
          <Link
            href="/marketing/pipeline"
            className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
          >
            Manage pipeline →
          </Link>
        </div>
        <FunnelBars funnel={funnel} stages={t.stages} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="v2-card p-5">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
            Recent activity
          </h2>
          {recent.length === 0 ? (
            <EmptyState
              icon="📇"
              title={`No ${t.leads} yet.`}
              body="Add one in the pipeline to start tracking activity here."
              action={
                <ActionButton variant="secondary" size="sm" href="/marketing/pipeline">
                  Open pipeline
                </ActionButton>
              }
            />
          ) : (
            <ul className="divide-y divide-[color:var(--color-hairline)]">
              {recent.map((r) => {
                const stage = t.stages.find((s) => s.key === r.pipelineStage)
                const accent = stageAccentClasses(stage?.accent ?? 'stone')
                return (
                  <li key={r.id} className="py-2 flex items-center gap-3">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${accent.dot}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                        {r.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {r.email}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${accent.bg} ${accent.text}`}>
                      {stage?.label ?? r.pipelineStage}
                    </span>
                    <span
                      className="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0"
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

        <div className="v2-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Audiences</h2>
            <Link
              href="/growth/audiences"
              className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
            >
              Manage →
            </Link>
          </div>
          {audiences.length === 0 ? (
            <EmptyState
              icon="🎯"
              title="No saved segments yet."
              body="Save a segment to turn the pipeline into reusable lists you can send a campaign to."
              action={
                <ActionButton variant="secondary" size="sm" href="/growth/audiences">
                  Create a segment
                </ActionButton>
              }
            />
          ) : (
            <ul className="space-y-2">
              {audiences.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-200">{a.name}</span>
                  {a.description && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate ml-2">
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
            <div className="w-32 text-xs font-medium text-gray-700 dark:text-gray-200 shrink-0">
              {stage?.label ?? f.stage}
            </div>
            <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden">
              <div
                className={`h-full ${accent.dot} rounded-md transition-all`}
                style={{ width: `${pct}%`, opacity: 0.85 }}
              />
            </div>
            <div className="w-12 text-right text-xs font-semibold text-gray-700 dark:text-gray-200 tabular-nums font-mono-num">
              {f.count}
            </div>
          </div>
        )
      })}
    </div>
  )
}
