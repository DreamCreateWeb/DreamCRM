export const metadata = {
  title: 'Platform Metrics - Dream Create',
  description: 'Clinic growth, plan breakdown, and subscription health',
}

import {
  getClinicCount, getActiveSubCount, getOnboardingCount,
  getPlanCounts, getStatusCounts, getMonthlySignups,
} from '@/features/platform-dashboard/queries'
import MonthBarChart from '@/features/platform-dashboard/month-bar-chart'
import PlanDoughnut from '@/features/platform-dashboard/plan-doughnut'
import { planBadge, fmt$$, PLAN_COLORS } from '@/features/platform-dashboard/badges'

const PLAN_PRICES: Record<string, number> = { basic: 99, pro: 149, premium: 199 }

const STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  trialing: '#0ea5e9',
  past_due: '#f59e0b',
  canceled: '#ef4444',
  unpaid: '#ef4444',
  none: '#6b7280',
}

export default async function PlatformMetrics() {
  const [clinicCount, activeSubs, onboardingCount, planCounts, statusCounts, signups12] = await Promise.all([
    getClinicCount(),
    getActiveSubCount(),
    getOnboardingCount(),
    getPlanCounts(),
    getStatusCounts(),
    getMonthlySignups(12),
  ])

  const planByTier = Object.fromEntries(planCounts.map(p => [p.planTier, p.count]))

  // MRR breakdown per plan
  const planMRR = planCounts.map(p => ({
    tier: p.planTier,
    count: p.count,
    mrr: p.count * (PLAN_PRICES[p.planTier] ?? 99),
  }))
  const totalMRR = planMRR.reduce((s, p) => s + p.mrr, 0)

  // Doughnut slices
  const planSlices = planCounts
    .filter(p => p.count > 0)
    .map(p => ({
      label: p.planTier.charAt(0).toUpperCase() + p.planTier.slice(1),
      value: p.count,
      color: PLAN_COLORS[p.planTier] ?? '#6b7280',
    }))

  const statusSlices = statusCounts
    .filter(s => s.count > 0)
    .map(s => ({
      label: s.status === 'none' ? 'No Subscription' : s.status.replace('_', ' '),
      value: s.count,
      color: STATUS_COLORS[s.status] ?? '#6b7280',
    }))

  // Conversion rate
  const conversionRate = clinicCount > 0
    ? Math.round((activeSubs / clinicCount) * 100)
    : 0

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">Platform Metrics</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Clinic growth, plan distribution, and subscription health</p>
      </div>

      {/* Plan stat cards */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        <div className="col-span-12 sm:col-span-6 xl:col-span-3 bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Basic Plan</p>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{planByTier.basic ?? 0}</p>
          <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">{fmt$$(( planByTier.basic ?? 0) * 99)}/mo</p>
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3 bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Pro Plan</p>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{planByTier.pro ?? 0}</p>
          <p className="text-sm text-sky-600 dark:text-sky-400 mt-1">{fmt$$((planByTier.pro ?? 0) * 149)}/mo</p>
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3 bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Premium Plan</p>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{planByTier.premium ?? 0}</p>
          <p className="text-sm text-violet-600 dark:text-violet-400 mt-1">{fmt$$((planByTier.premium ?? 0) * 199)}/mo</p>
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3 bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Conversion Rate</p>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{conversionRate}%</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{onboardingCount} still onboarding</p>
        </div>
      </div>

      {/* Signup trend (12 months) */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8 flex flex-col">
        <div className="px-5 pt-5 pb-1">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Signup Growth</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">New clinics per month, last 12 months</p>
        </div>
        <MonthBarChart
          data={signups12}
          color="#8b5cf6"
          formatLabel={(v) => String(Math.round(v))}
        />
      </div>

      {/* Plan distribution + Status distribution */}
      <div className="grid grid-cols-12 gap-6 mb-8">

        <div className="col-span-12 lg:col-span-6 flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <div className="px-5 pt-5 pb-1">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Plan Mix</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Clinics by plan tier</p>
          </div>
          {planSlices.length > 0 ? (
            <PlanDoughnut slices={planSlices} />
          ) : (
            <div className="grow flex items-center justify-center py-16 text-sm text-gray-400 dark:text-gray-500">No data yet</div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-6 flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <div className="px-5 pt-5 pb-1">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Subscription Health</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Clinics by subscription status</p>
          </div>
          {statusSlices.length > 0 ? (
            <PlanDoughnut slices={statusSlices} />
          ) : (
            <div className="grow flex items-center justify-center py-16 text-sm text-gray-400 dark:text-gray-500">No data yet</div>
          )}
        </div>

      </div>

      {/* Plan breakdown table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Revenue Breakdown by Plan</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="table-auto w-full text-sm dark:text-gray-300">
            <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
              <tr>
                <th className="px-5 py-3 text-left">Plan</th>
                <th className="px-2 py-3 text-left">Price/mo</th>
                <th className="px-2 py-3 text-left">Clinics</th>
                <th className="px-2 py-3 text-left">MRR</th>
                <th className="px-2 py-3 text-left">% of MRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {['basic', 'pro', 'premium'].map(tier => {
                const row = planMRR.find(p => p.tier === tier) ?? { tier, count: 0, mrr: 0 }
                const pct = totalMRR > 0 ? Math.round((row.mrr / totalMRR) * 100) : 0
                return (
                  <tr key={tier}>
                    <td className="px-5 py-3">{planBadge(tier)}</td>
                    <td className="px-2 py-3 text-gray-600 dark:text-gray-300">{fmt$$(PLAN_PRICES[tier] ?? 99)}</td>
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
                <td className="px-2 py-3" />
                <td className="px-2 py-3 text-gray-800 dark:text-gray-100 tabular-nums">{planMRR.reduce((s, p) => s + p.count, 0)}</td>
                <td className="px-2 py-3 text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(totalMRR)}</td>
                <td className="px-2 py-3 text-gray-500">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
