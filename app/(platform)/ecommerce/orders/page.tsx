export const metadata = {
  title: 'Sales Pipeline - Dream Create',
  description: 'Clinic lifecycle from onboarding to active subscriber',
}

import { getAllClinicSubs } from '@/features/platform-dashboard/queries'
import { planBadge, statusBadge, fmt$$, fmtDate } from '@/features/platform-dashboard/badges'

const PLAN_PRICES: Record<string, number> = { basic: 99, pro: 149, premium: 199 }

type Stage = 'Onboarding' | 'No Subscription' | 'Trialing' | 'Active' | 'Past Due' | 'Canceled'

function getStage(c: { subscriptionStatus: string | null; hasProfile: boolean }): Stage {
  if (!c.hasProfile) return 'Onboarding'
  switch (c.subscriptionStatus) {
    case 'active': return 'Active'
    case 'trialing': return 'Trialing'
    case 'past_due':
    case 'unpaid': return 'Past Due'
    case 'canceled': return 'Canceled'
    default: return 'No Subscription'
  }
}

const STAGE_ORDER: Stage[] = ['Onboarding', 'No Subscription', 'Trialing', 'Active', 'Past Due', 'Canceled']

const STAGE_STYLES: Record<Stage, { bg: string; text: string; dot: string }> = {
  Onboarding:        { bg: 'bg-gray-100 dark:bg-gray-700',            text: 'text-gray-600 dark:text-gray-300',   dot: 'bg-gray-400' },
  'No Subscription': { bg: 'bg-yellow-100 dark:bg-yellow-400/20',     text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-400' },
  Trialing:          { bg: 'bg-sky-100 dark:bg-sky-400/20',           text: 'text-sky-700 dark:text-sky-400',     dot: 'bg-sky-400' },
  Active:            { bg: 'bg-emerald-100 dark:bg-emerald-400/20',   text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  'Past Due':        { bg: 'bg-amber-100 dark:bg-amber-400/20',       text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-400' },
  Canceled:          { bg: 'bg-red-100 dark:bg-red-400/20',           text: 'text-red-600 dark:text-red-400',     dot: 'bg-red-400' },
}

export default async function SalesPipeline() {
  const clinics = await getAllClinicSubs()

  const grouped = Object.fromEntries(STAGE_ORDER.map(s => [s, [] as typeof clinics])) as Record<Stage, typeof clinics>
  for (const c of clinics) {
    grouped[getStage(c)].push(c)
  }

  const stageMRR = (stage: Stage) =>
    grouped[stage].reduce((s, c) => s + (PLAN_PRICES[c.planTier ?? 'basic'] ?? 99), 0)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">Sales Pipeline</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Clinic lifecycle from first sign-up to active subscriber</p>
      </div>

      {/* Stage summary cards */}
      <div className="grid grid-cols-12 gap-4 mb-8">
        {STAGE_ORDER.map(stage => {
          const count = grouped[stage].length
          const mrr = stageMRR(stage)
          const s = STAGE_STYLES[stage]
          return (
            <div key={stage} className="col-span-12 sm:col-span-6 xl:col-span-2 bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                <span className={`text-xs font-semibold ${s.text}`}>{stage}</span>
              </div>
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{count}</p>
              {(stage === 'Active' || stage === 'Trialing') && mrr > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{fmt$$(mrr)}/mo</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Pipeline table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">
            All Clinics <span className="text-gray-400 dark:text-gray-500 font-medium">{clinics.length}</span>
          </h2>
        </header>

        {clinics.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
            No clinics yet — your pipeline will fill in as clinics sign up.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm dark:text-gray-300">
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Clinic</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Owner</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Stage</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Plan</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Value</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {STAGE_ORDER.flatMap(stage =>
                  grouped[stage].map(c => {
                    const stage_ = getStage(c)
                    const s = STAGE_STYLES[stage_]
                    const value = (stage_ === 'Active' || stage_ === 'Trialing')
                      ? fmt$$(PLAN_PRICES[c.planTier ?? 'basic'] ?? 99) + '/mo'
                      : '—'
                    return (
                      <tr key={c.id}>
                        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                          <div className="font-medium text-gray-800 dark:text-gray-100">{c.name}</div>
                        </td>
                        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                          <div className="text-gray-800 dark:text-gray-100">{c.ownerName ?? '—'}</div>
                          <div className="text-xs text-gray-400">{c.ownerEmail ?? ''}</div>
                        </td>
                        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                            {stage_}
                          </span>
                        </td>
                        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">{planBadge(c.planTier)}</td>
                        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap font-medium text-gray-800 dark:text-gray-100 tabular-nums">{value}</td>
                        <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-gray-400 dark:text-gray-500">{fmtDate(c.createdAt)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
