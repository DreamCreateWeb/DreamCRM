import {
  getStripeRevenueWindow,
  getProjectRevenueWindow,
  getOutstandingRevenue,
  getTopRevenueClinics,
  getRecentRevenueTransactions,
} from '@/lib/services/revenue'
import { getMrrSnapshot } from '@/lib/services/platform-metrics'
import { formatMoneyShort, formatRelativeDate } from '@/lib/utils/format'
import Sparkline from '@/components/ui/sparkline'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { KpiStat } from '@/components/ui/kpi-stat'
import { EmptyState } from '@/components/ui/empty-state'

function moneyFull(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export default async function PlatformRevenue() {
  const [stripeWindow, projectWindow, outstanding, top, recent, mrr] = await Promise.all([
    getStripeRevenueWindow(12),
    getProjectRevenueWindow(12),
    getOutstandingRevenue(),
    getTopRevenueClinics(5),
    getRecentRevenueTransactions(15),
    getMrrSnapshot(),
  ])

  // Combine the two trend series into a single chart series.
  const combinedBuckets = stripeWindow.buckets.map((b, i) => ({
    bucket: b.bucket,
    value: b.value + (projectWindow.buckets[i]?.value ?? 0),
  }))
  const totalRevenue12w = stripeWindow.totalCents + projectWindow.totalCents
  const outstandingTotal = outstanding.pastDueInvoiceCents + outstanding.openProjectCents

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow="Platform · Dream Create"
        title="Revenue"
        subtitle="Subscriptions, project work, and outstanding receivables."
        actions={
          <>
            <ActionButton href="/ecommerce/invoices" variant="secondary">
              Subscriptions
            </ActionButton>
            <ActionButton href="/dashboard/analytics" variant="secondary">
              Platform Metrics
            </ActionButton>
          </>
        }
      />

      {(stripeWindow.stripeUnavailable || outstanding.stripeUnavailable || recent.stripeUnavailable) && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-300">
          Stripe couldn&apos;t be reached, so subscription revenue numbers are
          incomplete. Check the <code>STRIPE_SECRET_KEY</code> env var.
        </div>
      )}

      {/* Top-line KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiStat
          label="Total (12 weeks)"
          value={formatMoneyShort(totalRevenue12w)}
          sub={`${stripeWindow.paidInvoiceCount} invoices · ${projectWindow.completedCount} projects`}
        />
        <KpiStat
          label="MRR"
          value={formatMoneyShort(mrr.monthlyRecurringCents)}
          sub={`${mrr.activeClinics} active subs · ARR ${formatMoneyShort(mrr.annualRunRateCents)}`}
        />
        <KpiStat
          label="Project Revenue (12w)"
          value={formatMoneyShort(projectWindow.totalCents)}
          sub={`${projectWindow.completedCount} completed`}
        />
        <KpiStat
          label="Outstanding"
          value={formatMoneyShort(outstandingTotal)}
          sub={`${outstanding.pastDueInvoiceCount} past-due · ${outstanding.openProjectCount} open projects`}
          tone={outstandingTotal > 0 ? 'warn' : undefined}
        />
      </div>

      {/* Combined revenue trend */}
      <div className="v2-card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              Revenue — last 12 weeks
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Stripe-paid subscriptions + completed project budgets, bucketed weekly.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <LegendDot color="#8b5cf6" label="Subscriptions" />
            <LegendDot color="#10b981" label="Projects" />
            <LegendDot color="#0ea5e9" label="Combined" />
          </div>
        </div>
        <div className="space-y-4">
          <TrendRow
            label="Combined"
            data={combinedBuckets}
            color="#0ea5e9"
            total={formatMoneyShort(totalRevenue12w)}
          />
          <TrendRow
            label="Subscriptions"
            data={stripeWindow.buckets}
            color="#8b5cf6"
            total={formatMoneyShort(stripeWindow.totalCents)}
          />
          <TrendRow
            label="Projects"
            data={projectWindow.buckets}
            color="#10b981"
            total={formatMoneyShort(projectWindow.totalCents)}
          />
        </div>
      </div>

      {/* Top contributors + Outstanding breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="v2-card p-6 lg:col-span-2">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
            Top Revenue Contributors (lifetime)
          </h3>
          {top.rows.length === 0 ? (
            <EmptyState
              title="No revenue recorded yet"
              body="Once Stripe invoices start coming in or projects start completing, your top clinics will show up here."
            />
          ) : (
            <ul className="space-y-3">
              {top.rows.map((r) => (
                <li key={r.clinicId ?? r.clinicName} className="">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-gray-800 dark:text-gray-100">
                      {r.clinicName}
                    </span>
                    <span className="font-semibold text-gray-800 dark:text-gray-100 tabular-nums">
                      {moneyFull(r.total)}
                    </span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700/60">
                    {r.subscriptionCents > 0 && (
                      <div
                        className="bg-violet-500"
                        style={{ width: `${(r.subscriptionCents / r.total) * 100}%` }}
                        title={`Subs: ${moneyFull(r.subscriptionCents)}`}
                      />
                    )}
                    {r.projectCents > 0 && (
                      <div
                        className="bg-emerald-500"
                        style={{ width: `${(r.projectCents / r.total) * 100}%` }}
                        title={`Projects: ${moneyFull(r.projectCents)}`}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1 tabular-nums">
                    {r.subscriptionCents > 0 && (
                      <span>Subs {moneyFull(r.subscriptionCents)}</span>
                    )}
                    {r.projectCents > 0 && (
                      <span>Projects {moneyFull(r.projectCents)}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="v2-card p-6">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
            Outstanding
          </h3>
          {outstandingTotal === 0 ? (
            <EmptyState
              icon="🎉"
              title="No outstanding receivables"
              body="Every invoice is paid and no open project value is on the books."
            />
          ) : (
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-800 dark:text-gray-100">Past-due invoices</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {outstanding.pastDueInvoiceCount} from Stripe
                  </div>
                </div>
                <span
                  className={`font-semibold tabular-nums ${outstanding.pastDueInvoiceCents > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-800 dark:text-gray-100'}`}
                >
                  {moneyFull(outstanding.pastDueInvoiceCents)}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-800 dark:text-gray-100">Open project value</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {outstanding.openProjectCount} active engagements
                  </div>
                </div>
                <span className="font-semibold text-gray-800 dark:text-gray-100 tabular-nums">
                  {moneyFull(outstanding.openProjectCents)}
                </span>
              </li>
              <li className="pt-3 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">Total</span>
                <span className="font-bold text-gray-800 dark:text-gray-100 tabular-nums">
                  {moneyFull(outstandingTotal)}
                </span>
              </li>
            </ul>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="v2-card">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Recent Transactions
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            {recent.rows.length} most recent
          </span>
        </div>
        {recent.rows.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            body="Paid invoices and completed project budgets will appear here."
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {recent.rows.map((tx) => (
              <li key={tx.id} className="flex items-center gap-4 px-6 py-3">
                <span
                  className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-sm ${
                    tx.source === 'subscription'
                      ? 'bg-violet-500/15 text-violet-700 dark:text-violet-400'
                      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  }`}
                  aria-hidden
                >
                  {tx.source === 'subscription' ? '↻' : '✓'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 dark:text-gray-100 truncate">
                    {tx.description}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate" suppressHydrationWarning>
                    {tx.clinicName ?? 'Unknown clinic'} · {formatRelativeDate(tx.occurredAt)}
                  </div>
                </div>
                <span className="shrink-0 font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  +{moneyFull(tx.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

function TrendRow({
  label,
  data,
  color,
  total,
}: {
  label: string
  data: Array<{ bucket: string; value: number }>
  color: string
  total: string
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-28 shrink-0">
        <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
        <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{total}</div>
      </div>
      <div className="flex-1">
        <Sparkline data={data} variant="line" color={color} width={760} height={40} labels />
      </div>
    </div>
  )
}
