export const metadata = {
  title: 'Dashboard - DreamCRM',
  description: 'Overview of CRM activity',
}

export const dynamic = 'force-dynamic'

import FilterButton from '@/components/dropdown-filter'
import Datepicker from '@/components/datepicker'
import DashboardCard01 from './dashboard-card-01'
import DashboardCard02 from './dashboard-card-02'
import DashboardCard03 from './dashboard-card-03'
import DashboardCard04 from './dashboard-card-04'
import DashboardCard05 from './dashboard-card-05'
import DashboardCard06 from './dashboard-card-06'
import DashboardCard07 from './dashboard-card-07'
import DashboardCard08 from './dashboard-card-08'
import DashboardCard09 from './dashboard-card-09'
import DashboardCard10 from './dashboard-card-10'
import DashboardCard11 from './dashboard-card-11'
import { requireUser } from '@/lib/session'
import { getDashboardKpis } from '@/lib/services/dashboard'
import { formatMoney, formatNumber } from '@/lib/utils'

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="col-span-full sm:col-span-6 xl:col-span-3 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <div className="px-5 py-4">
        <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-1">{label}</div>
        <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{value}</div>
        {hint ? <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</div> : null}
      </div>
    </div>
  )
}

export default async function Dashboard() {
  await requireUser()
  const kpis = await getDashboardKpis()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Dashboard actions */}
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        {/* Left: Title */}
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Dashboard</h1>
        </div>
        {/* Right: Actions */}
        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          <FilterButton align="right" />
          <Datepicker />
          <button className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white">
            <svg className="fill-current shrink-0 xs:hidden" width="16" height="16" viewBox="0 0 16 16">
              <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
            </svg>
            <span className="max-xs:sr-only">Add View</span>
          </button>
        </div>
      </div>

      {/* Live KPIs from DB */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        <Kpi label="Customers" value={formatNumber(kpis.customerCount)} hint="Active in CRM" />
        <Kpi label="Revenue (paid)" value={formatMoney(kpis.revenueCents)} hint={`${formatNumber(kpis.paidInvoiceCount)} invoices paid`} />
        <Kpi label="Open Tasks" value={formatNumber(kpis.openTaskCount)} hint="To-do + in progress" />
        <Kpi label="Active Campaigns" value={formatNumber(kpis.activeCampaignCount)} hint="Active or scheduled" />
        <Kpi label="MRR (last 30d)" value={formatMoney(kpis.mrrCents)} hint="Paid invoices last 30d" />
        <Kpi label="New Sign-ups" value={formatNumber(kpis.newSignups30d)} hint="Last 30 days" />
        <Kpi label="Orders" value={formatNumber(kpis.orderCount)} hint={formatMoney(kpis.orderTotalCents) + ' total'} />
        <Kpi label="Pipeline Value" value={formatMoney(kpis.orderTotalCents + kpis.revenueCents)} hint="Orders + paid invoices" />
      </div>

      {/* Cards */}
      <div className="grid grid-cols-12 gap-6">
        <DashboardCard01 />
        <DashboardCard02 />
        <DashboardCard03 />
        <DashboardCard04 />
        <DashboardCard05 />
        <DashboardCard06 />
        <DashboardCard07 />
        <DashboardCard08 />
        <DashboardCard09 />
        <DashboardCard10 />
        <DashboardCard11 />
      </div>
    </div>
  )
}
