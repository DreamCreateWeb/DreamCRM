import Link from 'next/link'
import { getSubscriptionStats } from '@/lib/services/projects'
import { getClinicGrowth } from '@/lib/services/platform-metrics'
import { getAttentionItems, getRecentPlatformActivity } from '@/lib/services/operations'
import { getPmsDemand } from '@/lib/services/pms-interest'
import { PROVIDER_LABELS } from '@/lib/types/pms'
import { formatMoneyShort, formatNumberShort, formatRelativeDate } from '@/lib/utils/format'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiStat } from '@/components/ui/kpi-stat'

const KIND_ICONS: Record<string, string> = {
  past_due_invoice: '⚠️',
  stalled_project: '⏸',
  overdue_project: '⏰',
  new_signup: '🎉',
  signup: '🎉',
  project_completed: '✅',
  project_started: '🚀',
  subscription_paid: '💵',
}

// Decorative reinforcement of the already-labeled item text — color is never
// the only signal here (each row carries an emoji + a full text title).
const KIND_COLOR: Record<string, string> = {
  past_due_invoice: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  stalled_project: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  overdue_project: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  new_signup: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
}

function moneyFull(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export default async function PlatformOverview() {
  const [subs, clinicGrowth, attention, activity, pmsDemand] = await Promise.all([
    getSubscriptionStats(),
    // New clinic signups per week, last 12 weeks — the Active Clinics tile's
    // heartbeat (law 7). Same series the Platform Metrics dashboard plots;
    // demo org excluded at the service.
    getClinicGrowth(12),
    getAttentionItems({ perKind: 3 }),
    getRecentPlatformActivity(10),
    getPmsDemand(),
  ])
  const pmsWanted = pmsDemand.filter((d) => d.pending > 0)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow="Platform · Dream Create"
        title="Overview"
        subtitle="Today's pulse and what needs your attention."
        actions={
          <>
            <ActionButton href="/dashboard/analytics" variant="secondary">
              Platform Metrics →
            </ActionButton>
            <ActionButton href="/dashboard/fintech" variant="secondary">
              Revenue →
            </ActionButton>
          </>
        }
      />

      {/* ── Today's pulse — 4 status numbers, no trends ────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiStat
          label="Active Clinics"
          value={formatNumberShort(subs.activeClinics)}
          sub={`${subs.newClinics30d} new in 30d`}
          href="/ecommerce/customers"
          spark={clinicGrowth.buckets}
        />
        <KpiStat
          label="MRR"
          value={formatMoneyShort(subs.monthlyRecurringCents)}
          sub="From active plan tiers"
          href="/ecommerce/invoices"
        />
        <KpiStat
          label="Open Projects"
          value={formatNumberShort(attention.stalledProjectCount + attention.overdueProjectCount + (activity.rows.filter((a) => a.kind === 'project_started').length))}
          sub="See Platform Metrics for trend"
          href="/dashboard/analytics"
        />
        <KpiStat
          label="Needs Attention"
          value={formatNumberShort(attention.total)}
          sub={
            attention.total === 0
              ? "You're caught up"
              : `${attention.pastDueInvoiceCount} past-due · ${attention.stalledProjectCount + attention.overdueProjectCount} project flags`
          }
          tone={attention.total > 0 ? 'warn' : undefined}
        />
      </div>

      {attention.stripeUnavailable && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-300">
          Stripe couldn't be reached — past-due invoice checks skipped this load.
        </div>
      )}

      {/* ── PMS demand — which roadmap PMS to pursue next ─────────────────
          Only shows when clinics have raised a hand. Turns the "coming soon"
          catalog tiles into a prioritized partnership pipeline. */}
      {pmsWanted.length > 0 && (
        <div className="v2-card p-6 mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              PMS integration demand
            </h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Clinics waiting — pursue the vendor with the most demand first
            </span>
          </div>
          <ul className="space-y-2">
            {pmsWanted.map((d) => (
              <li
                key={d.provider}
                className="flex items-center justify-between rounded-lg border border-[color:var(--color-hairline)] px-4 py-2.5"
              >
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {PROVIDER_LABELS[d.provider as keyof typeof PROVIDER_LABELS] ?? d.provider}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">
                  {d.pending} {d.pending === 1 ? 'clinic' : 'clinics'} waiting
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Needs Your Attention ──────────────────────────────────────── */}
      <div className="v2-card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Needs Your Attention
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Past-due invoices, stalled or overdue projects, new clinics to welcome.
            </p>
          </div>
          {attention.pastDueInvoiceCents > 0 && (
            <span className="text-sm font-semibold text-rose-700 dark:text-rose-300 tabular-nums font-mono-num">
              {moneyFull(attention.pastDueInvoiceCents)} past-due
            </span>
          )}
        </div>
        {attention.items.length === 0 ? (
          <EmptyState
            icon="✅"
            title="All clear"
            body="No past-due invoices, no stalled projects, no new signups waiting."
          />
        ) : (
          <ul className="divide-y divide-[color:var(--color-hairline)]">
            {attention.items.map((item, i) => {
              const inner = (
                <div className="flex items-center gap-4">
                  <span
                    className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full text-sm ${KIND_COLOR[item.kind] ?? 'bg-gray-100 dark:bg-gray-700/60'}`}
                    aria-hidden
                  >
                    {KIND_ICONS[item.kind] ?? '•'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 dark:text-gray-100 truncate">
                      {item.title}
                    </div>
                    {item.subtitle && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {item.subtitle}
                      </div>
                    )}
                  </div>
                  {item.amountCents != null && (
                    <span className="shrink-0 font-semibold text-rose-700 dark:text-rose-300 tabular-nums font-mono-num">
                      {moneyFull(item.amountCents)}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400 hidden sm:inline tabular-nums" suppressHydrationWarning>
                    {formatRelativeDate(item.ts)}
                  </span>
                </div>
              )
              // Rows drill into the surface that explains them (item.href from
              // the service). '/dashboard' IS this page — no self-links.
              const drillable = item.href && item.href !== '/dashboard'
              return (
                <li
                  key={`${item.kind}-${i}`}
                  className={`py-3 ${drillable ? 'hover:bg-gray-50 dark:hover:bg-gray-900/30' : ''}`}
                >
                  {drillable ? (
                    <Link href={item.href!} className="block">{inner}</Link>
                  ) : (
                    inner
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* ── Recent Platform Activity — mixed feed ──────────────────────── */}
      <div className="v2-card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Recent Platform Activity
          </h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Signups, deliveries, and payments
          </span>
        </div>
        {activity.rows.length === 0 ? (
          <EmptyState
            title="No activity yet"
            body="Once clinics sign up and projects start moving, you'll see them here."
          />
        ) : (
          <ul className="divide-y divide-[color:var(--color-hairline)]">
            {activity.rows.map((row) => (
              <li key={row.id} className="flex items-center gap-4 py-3">
                <span
                  className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700/60 text-sm"
                  aria-hidden
                >
                  {KIND_ICONS[row.kind] ?? '•'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 dark:text-gray-100 truncate">
                    {row.title}
                  </div>
                  {row.subtitle && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {row.subtitle}
                    </div>
                  )}
                </div>
                {row.amountCents != null && (
                  <span className="shrink-0 font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums font-mono-num">
                    +{moneyFull(row.amountCents)}
                  </span>
                )}
                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400 hidden sm:inline tabular-nums" suppressHydrationWarning>
                  {formatRelativeDate(row.ts)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Jump-off quick links to the other metric modules ──────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <QuickLink
          href="/dashboard/analytics"
          title="Platform Metrics"
          subtitle="Trends, churn, ARPU, project funnel"
        />
        <QuickLink
          href="/dashboard/fintech"
          title="Revenue"
          subtitle="Subscriptions, project work, transactions"
        />
        <QuickLink
          href="/ecommerce/customers"
          title="Clinics"
          subtitle="Manage clinic accounts"
        />
      </div>
    </div>
  )
}

function QuickLink({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <Link href={href} className="v2-card-interactive block px-5 py-4 group">
      <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
        {title}
        <span className="ml-1">→</span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</div>
    </Link>
  )
}
