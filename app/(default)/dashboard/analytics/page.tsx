export const metadata = {
  title: 'Analytics - DreamCRM',
  description: 'Analytics overview',
}

export const dynamic = 'force-dynamic'

import Datepicker from '@/components/datepicker'
import AnalyticsCard01 from './analytics-card-01'
import AnalyticsCard02 from './analytics-card-02'
import AnalyticsCard03 from './analytics-card-03'
import AnalyticsCard04 from './analytics-card-04'
import AnalyticsCard05 from './analytics-card-05'
import AnalyticsCard06 from './analytics-card-06'
import AnalyticsCard07 from './analytics-card-07'
import AnalyticsCard08 from './analytics-card-08'
import AnalyticsCard09 from './analytics-card-09'
import AnalyticsCard10 from './analytics-card-10'
import AnalyticsCard11 from './analytics-card-11'
import { requireUser } from '@/lib/session'
import { getAnalyticsKpis } from '@/lib/services/dashboard'
import { formatNumber } from '@/lib/utils'

export default async function Analytics() {
  await requireUser()
  const kpis = await getAnalyticsKpis()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Page header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Analytics</h1>
        </div>
        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          <Datepicker />
        </div>
      </div>

      {/* Live metrics from analyticsEvents */}
      <div className="col-span-full bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-6">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Live metrics (last 30 days)</h2>
        </div>
        <div className="px-5 py-4 grid grid-cols-12 gap-6">
          <div className="col-span-6 md:col-span-3">
            <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-1">Total Events</div>
            <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{formatNumber(kpis.totalEvents30d)}</div>
          </div>
          <div className="col-span-6 md:col-span-3">
            <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-1">Unique Users</div>
            <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{formatNumber(kpis.uniqueUsers30d)}</div>
          </div>
          <div className="col-span-12 md:col-span-6">
            <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-2">Top Events</div>
            {kpis.topEvents.length ? (
              <ul className="text-sm space-y-1">
                {kpis.topEvents.map((e) => (
                  <li key={e.name} className="flex justify-between">
                    <span className="text-gray-700 dark:text-gray-200">{e.name}</span>
                    <span className="font-medium text-gray-800 dark:text-gray-100">{formatNumber(e.count)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400">No events recorded yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-12 gap-6">
        <AnalyticsCard01 />
        <AnalyticsCard02 />
        <AnalyticsCard03 />
        <AnalyticsCard04 />
        <AnalyticsCard05 />
        <AnalyticsCard06 />
        <AnalyticsCard07 />
        <AnalyticsCard08 />
        <AnalyticsCard09 />
        <AnalyticsCard10 />
        <AnalyticsCard11 />
      </div>
    </div>
  )
}
