export const metadata = {
  title: 'Overview - Dream Create',
  description: 'Platform health at a glance',
}

import {
  getClinicCount, getActiveSubCount, getNewClinicCount,
  getMRRFromDB, getPlanCounts, getMonthlySignups, getRecentClinics,
} from '@/features/platform-dashboard/queries'
import MonthBarChart from '@/features/platform-dashboard/month-bar-chart'
import PlanDoughnut from '@/features/platform-dashboard/plan-doughnut'
import { planBadge, statusBadge, fmt$$, fmtDate, PLAN_COLORS } from '@/features/platform-dashboard/badges'

export default async function Overview() {
  const [clinicCount, activeSubs, newClinics, mrr, planCounts, signups, recent] = await Promise.all([
    getClinicCount(),
    getActiveSubCount(),
    getNewClinicCount(30),
    getMRRFromDB(),
    getPlanCounts(),
    getMonthlySignups(6),
    getRecentClinics(6),
  ])

  const planSlices = planCounts
    .filter(p => p.count > 0)
    .map(p => ({
      label: p.planTier.charAt(0).toUpperCase() + p.planTier.slice(1),
      value: p.count,
      color: PLAN_COLORS[p.planTier] ?? '#6b7280',
    }))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">Overview</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Platform health at a glance</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        <div className="col-span-12 sm:col-span-6 xl:col-span-3 bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Total Clinics</p>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{clinicCount}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">all time</p>
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3 bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Active Subscriptions</p>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{activeSubs}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">active + trialing</p>
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3 bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">MRR</p>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(mrr)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">monthly recurring revenue</p>
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3 bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">New Clinics</p>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{newClinics}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">last 30 days</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-12 gap-6 mb-8">

        {/* Signup Trend */}
        <div className="col-span-12 xl:col-span-8 flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <div className="px-5 pt-5 pb-1">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Clinic Signups</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">New clinics per month, last 6 months</p>
          </div>
          <MonthBarChart
            data={signups}
            color="#8b5cf6"
            formatLabel={(v) => String(Math.round(v))}
          />
        </div>

        {/* Plan Distribution */}
        <div className="col-span-12 xl:col-span-4 flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <div className="px-5 pt-5 pb-1">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Plan Distribution</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{planCounts.reduce((s, p) => s + p.count, 0)} clinic profiles</p>
          </div>
          {planSlices.length > 0 ? (
            <PlanDoughnut slices={planSlices} />
          ) : (
            <div className="grow flex items-center justify-center py-16 text-sm text-gray-400 dark:text-gray-500">
              No clinic profiles yet
            </div>
          )}
        </div>

      </div>

      {/* Recent Signups */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">
            Recent Signups
            <span className="ml-2 text-gray-400 dark:text-gray-500 font-medium text-sm">{clinicCount}</span>
          </h2>
        </header>

        {recent.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
            No clinics yet — share your sign-up link to get your first client.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm dark:text-gray-300">
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-5 py-3 whitespace-nowrap text-left">Clinic</th>
                  <th className="px-2 py-3 whitespace-nowrap text-left">Owner</th>
                  <th className="px-2 py-3 whitespace-nowrap text-left">Plan</th>
                  <th className="px-2 py-3 whitespace-nowrap text-left">Status</th>
                  <th className="px-2 py-3 whitespace-nowrap text-left">Joined</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {recent.map(c => (
                  <tr key={c.id}>
                    <td className="px-5 py-3 font-medium text-gray-800 dark:text-gray-100">{c.name}</td>
                    <td className="px-2 py-3">
                      <div className="text-gray-800 dark:text-gray-100">{c.ownerName ?? '—'}</div>
                      <div className="text-xs text-gray-400">{c.ownerEmail ?? ''}</div>
                    </td>
                    <td className="px-2 py-3">{planBadge(c.planTier)}</td>
                    <td className="px-2 py-3">{statusBadge(c.subscriptionStatus)}</td>
                    <td className="px-2 py-3 text-gray-400 dark:text-gray-500">{fmtDate(c.createdAt)}</td>
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
