export const metadata = {
  title: 'Revenue - DreamCRM',
  description: 'Recurring revenue, project revenue, and outstanding receivables',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireTenant } from '@/lib/auth/context'
import PlatformRevenue from './platform-revenue'

export default async function RevenuePage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  if (ctx.tenantType === 'platform') return <PlatformRevenue />

  // Clinic-side Revenue — wires up when we build the clinic modules pass.
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          Revenue
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Patient revenue, treatment plan billing, and outstanding invoices for{' '}
          {ctx.organizationName}.
        </p>
      </div>
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-12 text-center">
        <p className="text-4xl mb-4">💰</p>
        <p className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
          Clinic Revenue coming soon
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          We&apos;re wiring this up as part of the clinic module pass. In the meantime,
          view your treatment plans and invoices below.
        </p>
        <div className="flex justify-center gap-2">
          <Link
            href="/invoices"
            className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
          >
            Invoices
          </Link>
          <Link
            href="/orders"
            className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
          >
            Treatment Plans
          </Link>
        </div>
      </div>
    </div>
  )
}
