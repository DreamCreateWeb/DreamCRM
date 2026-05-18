import Link from 'next/link'
import { listClinics } from '@/lib/services/clinics'
import { formatMoneyShort, formatNumberShort } from '@/lib/utils/format'
import ClinicsList from './clinics-list'

export default async function PlatformClinics() {
  const rows = await listClinics()

  // Aggregate top-line numbers from the rows we already have
  let activeCount = 0
  let pastDueCount = 0
  let newIn30d = 0
  let mrrCents = 0
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000
  for (const r of rows) {
    if (r.subscriptionStatus === 'active' || r.subscriptionStatus === 'trialing') {
      activeCount++
      mrrCents += r.monthlyContributionCents
    }
    if (
      r.subscriptionStatus === 'past_due' ||
      r.subscriptionStatus === 'unpaid' ||
      r.subscriptionStatus === 'incomplete_expired'
    ) {
      pastDueCount++
    }
    if (r.createdAt.getTime() >= thirtyDaysAgo) newIn30d++
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Clinics
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            All clinic tenants on Dream Create — drill in to manage their plan, projects, and site.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard"
            className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
          >
            ← Overview
          </Link>
          <Link
            href="/ecommerce/invoices"
            className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
          >
            Subscriptions
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label="Total Clinics" value={formatNumberShort(rows.length)} hint={`${newIn30d} new in 30d`} />
        <Stat label="Active Subscribers" value={formatNumberShort(activeCount)} hint="Paying or trialing" />
        <Stat
          label="Past Due"
          value={formatNumberShort(pastDueCount)}
          hint="Needs intervention"
          tone={pastDueCount > 0 ? 'warn' : 'default'}
        />
        <Stat label="Combined MRR" value={formatMoneyShort(mrrCents)} hint="From active clinics" />
      </div>

      <ClinicsList rows={rows} />
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'warn'
}) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-5 py-4">
      <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-1">
        {label}
      </div>
      <div
        className={`text-2xl font-bold ${tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'}`}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</div>}
    </div>
  )
}
