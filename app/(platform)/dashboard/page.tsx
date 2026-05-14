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

      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">Overview</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Platform health at a glance</p>
      </div>

      <div className="grid grid-cols-12 gap-6 mb-8">

        {/* KPI strip + signup trend */}
        <div className="flex flex-col col-span-full xl:col-span-8 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Clinic Signups</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">New clinics per month, last 6 months</p>
          </header>
          <div className="px-5 py-3">
            <div className="flex flex-wrap max-sm:*:w-1/2">
              <div className="flex items-center py-2">
                <div className="mr-5">
                  <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{clinicCount}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Total Clinics</div>
                </div>
                <div className="hidden md:block w-px h-8 bg-gray-200 dark:bg-gray-700 mr-5" aria-hidden="true" />
              </div>
              <div className="flex items-center py-2">
                <div className="mr-5">
                  <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{activeSubs}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Active Subscriptions</div>
                </div>
                <div className="hidden md:block w-px h-8 bg-gray-200 dark:bg-gray-700 mr-5" aria-hidden="true" />
              </div>
              <div className="flex items-center py-2">
                <div className="mr-5">
                  <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{fmt$$(mrr)}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">MRR</div>
                </div>
                <div className="hidden md:block w-px h-8 bg-gray-200 dark:bg-gray-700 mr-5" aria-hidden="true" />
              </div>
              <div className="flex items-center py-2">
                <div className="mr-5">
                  <div className="flex items-center">
                    <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums mr-2">{newClinics}</div>
                    <div className="text-sm font-medium text-emerald-700 px-1.5 bg-emerald-500/20 rounded-full">last 30d</div>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">New Clinics</div>
                </div>
              </div>
            </div>
          </div>
          <MonthBarChart data={signups} color="#8b5cf6" format="count" />
        </div>

        {/* Plan Distribution */}
        <div className="flex flex-col col-span-full xl:col-span-4 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Plan Distribution</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{planCounts.reduce((s, p) => s + p.count, 0)} active clinic profiles</p>
          </header>
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
            <table className="table-auto w-full dark:text-gray-300">
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Clinic</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Owner</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Plan</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Status</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Joined</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {recent.map(c => (
                  <tr key={c.id}>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                      <div className="font-medium text-gray-800 dark:text-gray-100">{c.name}</div>
                    </td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                      <div className="font-medium text-gray-800 dark:text-gray-100">{c.ownerName ?? '—'}</div>
                      <div className="text-xs text-gray-400">{c.ownerEmail ?? ''}</div>
                    </td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">{planBadge(c.planTier)}</td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">{statusBadge(c.subscriptionStatus)}</td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-gray-400 dark:text-gray-500">{fmtDate(c.createdAt)}</td>
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
