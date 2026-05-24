import Link from 'next/link'
import { getSubscriptionStats } from '@/lib/services/projects'
import { getAttentionItems, getRecentPlatformActivity } from '@/lib/services/operations'
import { formatMoneyShort, formatNumberShort, formatRelativeDate } from '@/lib/utils/format'

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

const KIND_COLOR: Record<string, string> = {
  past_due_invoice: 'bg-red-500/15 text-red-700 dark:text-red-400',
  stalled_project: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  overdue_project: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  new_signup: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
}

function moneyFull(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export default async function PlatformOverview() {
  const [subs, attention, activity] = await Promise.all([
    getSubscriptionStats(),
    getAttentionItems({ perKind: 3 }),
    getRecentPlatformActivity(10),
  ])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Overview
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Today's pulse and what needs your attention.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/analytics"
            className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
          >
            Platform Metrics →
          </Link>
          <Link
            href="/dashboard/fintech"
            className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
          >
            Revenue →
          </Link>
        </div>
      </div>

      {/* ── Today's pulse — 4 status numbers, no trends ────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Kpi
          label="Active Clinics"
          value={formatNumberShort(subs.activeClinics)}
          hint={`${subs.newClinics30d} new in 30d`}
        />
        <Kpi
          label="MRR"
          value={formatMoneyShort(subs.monthlyRecurringCents)}
          hint="From active plan tiers"
        />
        <Kpi
          label="Open Projects"
          value={formatNumberShort(attention.stalledProjectCount + attention.overdueProjectCount + (activity.rows.filter((a) => a.kind === 'project_started').length))}
          hint="See Platform Metrics for trend"
        />
        <Kpi
          label="Needs Attention"
          value={formatNumberShort(attention.total)}
          hint={
            attention.total === 0
              ? "You're caught up"
              : `${attention.pastDueInvoiceCount} past-due · ${attention.stalledProjectCount + attention.overdueProjectCount} project flags`
          }
          tone={attention.total > 0 ? 'warn' : 'default'}
        />
      </div>

      {attention.stripeUnavailable && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-400">
          Stripe couldn't be reached — past-due invoice checks skipped this load.
        </div>
      )}

      {/* ── Needs Your Attention ──────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              Needs Your Attention
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Past-due invoices, stalled or overdue projects, new clinics to welcome.
            </p>
          </div>
          {attention.pastDueInvoiceCents > 0 && (
            <span className="text-sm font-semibold text-red-600 dark:text-red-400">
              {moneyFull(attention.pastDueInvoiceCents)} past-due
            </span>
          )}
        </div>
        {attention.items.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-3xl mb-2">✅</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              All clear — no past-due invoices, no stalled projects, no new signups waiting.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {attention.items.map((item, i) => (
              <li key={`${item.kind}-${i}`} className="flex items-center gap-4 py-3">
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
                  <span className="shrink-0 font-semibold text-red-600 dark:text-red-400">
                    {moneyFull(item.amountCents)}
                  </span>
                )}
                <span className="shrink-0 text-xs text-gray-400 hidden sm:inline" suppressHydrationWarning>
                  {formatRelativeDate(item.ts)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Recent Platform Activity — mixed feed ──────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Recent Platform Activity
          </h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Signups, deliveries, and payments
          </span>
        </div>
        {activity.rows.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-8">
            No activity yet. Once clinics sign up and projects start moving, you'll see them here.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
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
                  <span className="shrink-0 font-semibold text-emerald-700 dark:text-emerald-400">
                    +{moneyFull(row.amountCents)}
                  </span>
                )}
                <span className="shrink-0 text-xs text-gray-400 hidden sm:inline" suppressHydrationWarning>
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

function Kpi({
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

function QuickLink({ href, title, subtitle }: { href: string; title: string; subtitle: string }) {
  return (
    <Link
      href={href}
      className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-5 py-4 hover:shadow-md transition group"
    >
      <div className="font-semibold text-gray-800 dark:text-gray-100 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition">
        {title}
        <span className="ml-1">→</span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</div>
    </Link>
  )
}
