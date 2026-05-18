export const metadata = {
  title: 'Bills - DreamCRM',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'

export default async function PatientBills() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') redirect('/')

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Bills</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Outstanding and past invoices from {ctx.organizationName}.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
        <p className="text-4xl mb-4">📄</p>
        <p className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
          No bills yet
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          You&apos;ll see any invoices from your clinic here once they&apos;ve been issued.
        </p>
      </div>
    </div>
  )
}
