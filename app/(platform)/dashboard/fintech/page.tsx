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

      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">Revenue</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          MRR from active subscriptions · Stripe invoices updated in real time
        </p>
      </div>

      {/* MRR KPIs + Monthly Revenue Chart */}
      <div className="flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Monthly Revenue</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Paid Stripe invoices, last 6 months</p>
        </header>
        <div className="px-5 py-3">
          <div className="flex flex-wrap max-sm:*:w-1/2">
            <div className="flex items-center py-2">
              <div className="mr-5">
                <div className="flex items-center">
                  <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums mr-2">{fmt$$(mrr)}</div>
                  <div className="text-sm font-medium text-emerald-700 px-1.5 bg-emerald-500/20 rounded-full">MRR</div>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">monthly recurring revenue</div>
              </div>
              <div className="hidden md:block w-px h-8 bg-gray-200 dark:bg-gray-700 mr-5" aria-hidden="true" />
            </div>
            <div className="flex items-center py-2">
              <div className="mr-5">
                <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(arr)}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">annualized run rate</div>
              </div>
              <div className="hidden md:block w-px h-8 bg-gray-200 dark:bg-gray-700 mr-5" aria-hidden="true" />
            </div>
            <div className="flex items-center py-2">
              <div className="mr-5">
                <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(arpa)}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">avg revenue per account</div>
              </div>
            </div>
          </div>
        </div>
        <MonthBarChart data={monthlyRevenue} color="#10b981" format="money" />
      </div>

      {/* Plan Breakdown + Revenue Doughnut */}
      <div className="grid grid-cols-12 gap-6 mb-8">

        <div className="col-span-12 xl:col-span-7 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">MRR by Plan</h2>
          </header>
          <div className="p-3">
            <div className="overflow-x-auto">
              <table className="table-auto w-full dark:text-gray-300">
                <thead className="text-xs uppercase text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-xs">
                  <tr>
                    <th className="p-2 whitespace-nowrap"><div className="font-semibold text-left">Plan</div></th>
                    <th className="p-2 whitespace-nowrap"><div className="font-semibold text-left">Clinics</div></th>
                    <th className="p-2 whitespace-nowrap"><div className="font-semibold text-left">MRR</div></th>
                    <th className="p-2 whitespace-nowrap"><div className="font-semibold text-left">% of Total</div></th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                  {['basic', 'pro', 'premium'].map(tier => {
                    const row = planMRR.find(p => p.tier === tier) ?? { tier, count: 0, mrr: 0 }
                    const pct = totalMRR > 0 ? Math.round((row.mrr / totalMRR) * 100) : 0
                    return (
                      <tr key={tier}>
                        <td className="p-2">{planBadge(tier)}</td>
                        <td className="p-2 font-medium text-gray-800 dark:text-gray-100 tabular-nums">{row.count}</td>
                        <td className="p-2 font-medium text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(row.mrr)}</td>
                        <td className="p-2">
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
                    <td className="p-2 text-gray-800 dark:text-gray-100">Total</td>
                    <td className="p-2 text-gray-800 dark:text-gray-100 tabular-nums">{planMRR.reduce((s, p) => s + p.count, 0)}</td>
                    <td className="p-2 text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(totalMRR)}</td>
                    <td className="p-2 text-gray-500">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-span-12 xl:col-span-5 flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Revenue by Plan</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Share of total MRR</p>
          </header>
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
            <table className="table-auto w-full dark:text-gray-300">
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Invoice</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Clinic</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Amount</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Status</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Date</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Link</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap font-mono text-xs text-gray-500 dark:text-gray-400">{inv.number ?? inv.id.slice(-8)}</td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap font-medium text-gray-800 dark:text-gray-100">{inv.clinicName}</td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap font-medium text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(inv.amount)}</td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">{invoiceStatusBadge(inv.status)}</td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-gray-400 dark:text-gray-500">{fmtDate(inv.created)}</td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                      {inv.hostedUrl && (
                        <a
                          href={inv.hostedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 text-xs"
                        >
                          View →
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
