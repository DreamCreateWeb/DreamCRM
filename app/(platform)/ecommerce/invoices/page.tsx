export const metadata = {
  title: 'Subscriptions - Dream Create',
  description: 'All clinic subscription statuses',
}

import { getAllClinicSubs } from '@/features/platform-dashboard/queries'
import { planBadge, statusBadge, fmtDate } from '@/features/platform-dashboard/badges'

const LIFECYCLE_STAGE = (c: { subscriptionStatus: string | null; hasProfile: boolean }): string => {
  if (!c.hasProfile) return 'Onboarding'
  switch (c.subscriptionStatus) {
    case 'active': return 'Active'
    case 'trialing': return 'Trialing'
    case 'past_due': return 'Past Due'
    case 'canceled': return 'Canceled'
    case 'unpaid': return 'Unpaid'
    default: return 'No Subscription'
  }
}

export default async function Subscriptions() {
  const clinics = await getAllClinicSubs()

  const counts = {
    all: clinics.length,
    active: clinics.filter(c => c.subscriptionStatus === 'active').length,
    trialing: clinics.filter(c => c.subscriptionStatus === 'trialing').length,
    past_due: clinics.filter(c => c.subscriptionStatus === 'past_due' || c.subscriptionStatus === 'unpaid').length,
    canceled: clinics.filter(c => c.subscriptionStatus === 'canceled').length,
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      {/* Header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-5">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">Subscriptions</h1>
        </div>
      </div>

      {/* Status filter tabs (visual only — filtering would require client state) */}
      <div className="mb-5">
        <ul className="flex flex-wrap -m-1">
          {[
            { label: 'All', count: counts.all },
            { label: 'Active', count: counts.active },
            { label: 'Trialing', count: counts.trialing },
            { label: 'Past Due', count: counts.past_due },
            { label: 'Canceled', count: counts.canceled },
          ].map((tab, i) => (
            <li key={tab.label} className="m-1">
              <span className={`inline-flex items-center justify-center text-sm font-medium leading-5 rounded-full px-3 py-1 border shadow-sm transition ${
                i === 0
                  ? 'border-transparent bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-800'
                  : 'border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}>
                {tab.label} <span className="ml-1 text-gray-400 dark:text-gray-500">{tab.count}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">
            All Clinics <span className="text-gray-400 dark:text-gray-500 font-medium">{clinics.length}</span>
          </h2>
        </header>

        {clinics.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
            No clinics have signed up yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm dark:text-gray-300">
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-5 py-3 text-left">Clinic</th>
                  <th className="px-2 py-3 text-left">Owner</th>
                  <th className="px-2 py-3 text-left">Plan</th>
                  <th className="px-2 py-3 text-left">Stage</th>
                  <th className="px-2 py-3 text-left">Joined</th>
                  <th className="px-2 py-3 text-left">Stripe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {clinics.map(c => (
                  <tr key={c.id}>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-800 dark:text-gray-100">{c.name}</div>
                      <div className="text-xs text-gray-400 font-mono">{c.id.slice(0, 8)}…</div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="text-gray-800 dark:text-gray-100">{c.ownerName ?? '—'}</div>
                      <div className="text-xs text-gray-400">{c.ownerEmail ?? ''}</div>
                    </td>
                    <td className="px-2 py-3">{planBadge(c.planTier)}</td>
                    <td className="px-2 py-3">{statusBadge(c.subscriptionStatus)}</td>
                    <td className="px-2 py-3 text-gray-400 dark:text-gray-500">{fmtDate(c.createdAt)}</td>
                    <td className="px-2 py-3">
                      {c.stripeCustomerId ? (
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500" title={c.stripeCustomerId}>
                          {c.stripeCustomerId.slice(0, 14)}…
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
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
