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

  const planMRR = planCounts.map(p => ({
    tier: p.planTier,
    count: p.count,
    mrr: p.count * (PLAN_PRICES[p.planTier] ?? 99),
  }))
  const totalMRR = planMRR.reduce((s, p) => s + p.mrr, 0)

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

  const conversionRate = clinicCount > 0
    ? Math.round((activeSubs / clinicCount) * 100)
    : 0

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">Platform Metrics</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Clinic growth, plan distribution, and subscription health</p>
      </div>

      {/* Plan KPIs + 12-month signup trend */}
      <div className="flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Signup Growth</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">New clinics per month, last 12 months</p>
        </header>
        <div className="px-5 py-3">
          <div className="flex flex-wrap max-sm:*:w-1/2">
            <div className="flex items-center py-2">
              <div className="mr-5">
                <div className="flex items-center">
                  <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums mr-2">{planByTier.basic ?? 0}</div>
                  <div className="text-sm font-medium text-emerald-700 px-1.5 bg-emerald-500/20 rounded-full">{fmt$$((planByTier.basic ?? 0) * 99)}/mo</div>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Basic Plan</div>
              </div>
              <div className="hidden md:block w-px h-8 bg-gray-200 dark:bg-gray-700 mr-5" aria-hidden="true" />
            </div>
            <div className="flex items-center py-2">
              <div className="mr-5">
                <div className="flex items-center">
                  <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums mr-2">{planByTier.pro ?? 0}</div>
                  <div className="text-sm font-medium text-sky-700 px-1.5 bg-sky-500/20 rounded-full">{fmt$$((planByTier.pro ?? 0) * 149)}/mo</div>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Pro Plan</div>
              </div>
              <div className="hidden md:block w-px h-8 bg-gray-200 dark:bg-gray-700 mr-5" aria-hidden="true" />
            </div>
            <div className="flex items-center py-2">
              <div className="mr-5">
                <div className="flex items-center">
                  <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums mr-2">{planByTier.premium ?? 0}</div>
                  <div className="text-sm font-medium text-violet-700 px-1.5 bg-violet-500/20 rounded-full">{fmt$$((planByTier.premium ?? 0) * 199)}/mo</div>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Premium Plan</div>
              </div>
              <div className="hidden md:block w-px h-8 bg-gray-200 dark:bg-gray-700 mr-5" aria-hidden="true" />
            </div>
            <div className="flex items-center py-2">
              <div className="mr-5">
                <div className="flex items-center">
                  <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums mr-2">{conversionRate}%</div>
                  <div className="text-sm font-medium text-amber-700 px-1.5 bg-amber-500/20 rounded-full">{onboardingCount} onboarding</div>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Conversion Rate</div>
              </div>
            </div>
          </div>
        </div>
        <MonthBarChart data={signups12} color="#8b5cf6" format="count" />
      </div>

      {/* Plan distribution + Status distribution */}
      <div className="grid grid-cols-12 gap-6 mb-8">

        <div className="col-span-12 lg:col-span-6 flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Plan Mix</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Clinics by plan tier</p>
          </header>
          {planSlices.length > 0 ? (
            <PlanDoughnut slices={planSlices} />
          ) : (
            <div className="grow flex items-center justify-center py-16 text-sm text-gray-400 dark:text-gray-500">No data yet</div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-6 flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Subscription Health</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Clinics by subscription status</p>
          </header>
          {statusSlices.length > 0 ? (
            <PlanDoughnut slices={statusSlices} />
          ) : (
            <div className="grow flex items-center justify-center py-16 text-sm text-gray-400 dark:text-gray-500">No data yet</div>
          )}
        </div>

      </div>

      {/* Revenue breakdown table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Revenue Breakdown by Plan</h2>
        </header>
        <div className="p-3">
          <div className="overflow-x-auto">
            <table className="table-auto w-full dark:text-gray-300">
              <thead className="text-xs uppercase text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded-xs">
                <tr>
                  <th className="p-2 whitespace-nowrap"><div className="font-semibold text-left">Plan</div></th>
                  <th className="p-2 whitespace-nowrap"><div className="font-semibold text-left">Price/mo</div></th>
                  <th className="p-2 whitespace-nowrap"><div className="font-semibold text-left">Clinics</div></th>
                  <th className="p-2 whitespace-nowrap"><div className="font-semibold text-left">MRR</div></th>
                  <th className="p-2 whitespace-nowrap"><div className="font-semibold text-left">% of MRR</div></th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {['basic', 'pro', 'premium'].map(tier => {
                  const row = planMRR.find(p => p.tier === tier) ?? { tier, count: 0, mrr: 0 }
                  const pct = totalMRR > 0 ? Math.round((row.mrr / totalMRR) * 100) : 0
                  return (
                    <tr key={tier}>
                      <td className="p-2">{planBadge(tier)}</td>
                      <td className="p-2 text-gray-600 dark:text-gray-300">{fmt$$(PLAN_PRICES[tier] ?? 99)}</td>
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
                  <td className="p-2" />
                  <td className="p-2 text-gray-800 dark:text-gray-100 tabular-nums">{planMRR.reduce((s, p) => s + p.count, 0)}</td>
                  <td className="p-2 text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(totalMRR)}</td>
                  <td className="p-2 text-gray-500">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  )
}
