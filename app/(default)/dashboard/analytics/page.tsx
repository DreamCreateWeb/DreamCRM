export const metadata = {
  title: 'Platform Metrics - DreamCRM',
  description: 'Growth, revenue, churn, and project performance',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import PlatformMetrics from './platform-metrics'

export default async function AnalyticsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  if (ctx.tenantType === 'platform') {
    return <PlatformMetrics />
  }

  // Clinic-side analytics — being built as part of the clinic module pass.
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          Analytics
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Patient growth, appointment volume, and booking funnel — for{' '}
          {ctx.organizationName}.
        </p>
      </div>
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-12 text-center">
        <p className="text-4xl mb-4">📊</p>
        <p className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
          Clinic Analytics coming soon
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Patient acquisition, appointment trends, and booking funnel for your clinic.
        </p>
      </div>
    </div>
  )
}
