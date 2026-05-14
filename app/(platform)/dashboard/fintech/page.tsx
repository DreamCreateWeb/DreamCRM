export const metadata = {
  title: 'Revenue - Dream Create',
  description: 'Monthly recurring revenue, plan breakdown, and Stripe invoices',
}

import {
  getMRRFromDB, getPlanCounts, getActiveSubCount,
} from '@/features/platform-dashboard/queries'
import {
  getMonthlyRevenue, getRecentInvoices,
} from '@/features/platform-dashboard/stripe-queries'
import MonthBarChart from '@/features/platform-dashboard/month-bar-chart'
import PlanDoughnut from '@/features/platform-dashboard/plan-doughnut'
import { planBadge, invoiceStatusBadge, fmt$$, fmtDate, PLAN_COLORS } from '@/features/platform-dashboard/badges'

const PLAN_PRICES: Record<string, number> = { basic: 99, pro: 149, premium: 199 }

export default async function Revenue() {
  const [mrr, planCounts, activeSubs, monthlyRevenue, invoices] = await Promise.all([
    getMRRFromDB(),
    getPlanCounts(),
    getActiveSubCount(),
    getMonthlyRevenue(6),
    getRecentInvoices(15),
  ])

  const arr = mrr * 12
  const arpa = activeSubs > 0 ? mrr / activeSubs : 0

  const planMRR = planCounts.map(p => ({
    tier: p.planTier,
    count: p.count,
    mrr: p.count * (PLAN_PRICES[p.planTier] ?? 99),
  }))
  const totalMRR = planMRR.reduce((s, p) => s + p.mrr, 0)

  const revenueSlices = planMRR
    .filter(p => p.mrr > 0)
    .map(p => ({
      label: p.tier.charAt(0).toUpperCase() + p.tier.slice(1),
      value: p.mrr,
      color: PLAN_COLORS[p.tier] ?? '#6b7280',
    }))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">Revenue</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          MRR from active subscriptions · Stripe invoices updated in real time
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        <div className="col-span-12 sm:col-span-6 lg:col-span-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">MRR</p>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(mrr)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">monthly recurring revenue</p>
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">ARR</p>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(arr)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">annualized run rate</p>
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">ARPA</p>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(arpa)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">avg revenue per account</p>
        </div>
      </div>

      {/* Monthly Revenue Chart */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8 flex flex-col">
        <div className="px-5 pt-5 pb-1">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Monthly Revenue</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Paid Stripe invoices, last 6 months</p>
        </div>
        <MonthBarChart
          data={monthlyRevenue}
          color="#10b981"
          formatLabel={(v) => `$${Math.round(v).toLocaleString()}`}
        />
      </div>

      {/* Plan Breakdown + Revenue Doughnut */}
      <div className="grid grid-cols-12 gap-6 mb-8">

        {/* Plan MRR table */}
        <div className="col-span-12 xl:col-span-7 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">MRR by Plan</h2>
          </header>
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm dark:text-gray-300">
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-5 py-3 text-left">Plan</th>
                  <th className="px-2 py-3 text-left">Clinics</th>
                  <th className="px-2 py-3 text-left">MRR</th>
                  <th className="px-2 py-3 text-left">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {['basic', 'pro', 'premium'].map(tier => {
                  const row = planMRR.find(p => p.tier === tier) ?? { tier, count: 0, mrr: 0 }
                  const pct = totalMRR > 0 ? Math.round((row.mrr / totalMRR) * 100) : 0
                  return (
                    <tr key={tier}>
                      <td className="px-5 py-3">{planBadge(tier)}</td>
                      <td className="px-2 py-3 font-medium text-gray-800 dark:text-gray-100 tabular-nums">{row.count}</td>
                      <td className="px-2 py-3 font-medium text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(row.mrr)}</td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: PLAN_COLORS[tier] ?? '#6b7280' }} />
                          </div>
                          <span className="text-gray-500 dark:text-gray-400 tabular-nums">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-gray-50 dark:bg-gray-900/20 font-semibold">
                  <td className="px-5 py-3 text-gray-800 dark:text-gray-100">Total</td>
                  <td className="px-2 py-3 text-gray-800 dark:text-gray-100 tabular-nums">{planMRR.reduce((s, p) => s + p.count, 0)}</td>
                  <td className="px-2 py-3 text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(totalMRR)}</td>
                  <td className="px-2 py-3 text-gray-500">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Revenue distribution doughnut */}
        <div className="col-span-12 xl:col-span-5 flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <div className="px-5 pt-5 pb-1">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Revenue by Plan</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Share of total MRR</p>
          </div>
          {revenueSlices.length > 0 ? (
            <PlanDoughnut slices={revenueSlices} />
          ) : (
            <div className="grow flex items-center justify-center py-16 text-sm text-gray-400 dark:text-gray-500">No active subscriptions</div>
          )}
        </div>

      </div>

      {/* Recent Invoices */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Recent Invoices</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Live from Stripe</p>
        </header>

        {invoices.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
            No invoices yet — they will appear here once clinics start paying.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm dark:text-gray-300">
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-5 py-3 text-left">Invoice</th>
                  <th className="px-2 py-3 text-left">Clinic</th>
                  <th className="px-2 py-3 text-left">Amount</th>
                  <th className="px-2 py-3 text-left">Status</th>
                  <th className="px-2 py-3 text-left">Date</th>
                  <th className="px-2 py-3 text-left">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{inv.number ?? inv.id.slice(-8)}</td>
                    <td className="px-2 py-3 font-medium text-gray-800 dark:text-gray-100">{inv.clinicName}</td>
                    <td className="px-2 py-3 font-medium text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(inv.amount)}</td>
                    <td className="px-2 py-3">{invoiceStatusBadge(inv.status)}</td>
                    <td className="px-2 py-3 text-gray-400 dark:text-gray-500">{fmtDate(inv.created)}</td>
                    <td className="px-2 py-3">
                      {inv.hostedUrl && (
                        <a
                          href={inv.hostedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-violet-500 hover:text-violet-600 text-xs"
                        >
                          View ↗
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
