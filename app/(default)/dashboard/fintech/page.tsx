export const metadata = {
  title: 'Fintech - DreamCRM',
  description: 'Fintech overview',
}

export const dynamic = 'force-dynamic'

import Datepicker from '@/components/datepicker'
import FintechIntro from './fintech-intro'
import FintechCard01 from './fintech-card-01'
import FintechCard03 from './fintech-card-03'
import FintechCard04 from './fintech-card-04'
import FintechCard07 from './fintech-card-07'
import FintechCard08 from './fintech-card-08'
import FintechCard09 from './fintech-card-09'
import FintechCard10 from './fintech-card-10'
import FintechCard11 from './fintech-card-11'
import FintechCard12 from './fintech-card-12'
import FintechCard13 from './fintech-card-13'
import FintechCard14 from './fintech-card-14'
import { requireUser } from '@/lib/session'
import { listCards, listTransactions, portfolioSummary } from '@/lib/services/fintech'
import { formatMoney, formatShortDate } from '@/lib/utils'

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

export default async function Fintech() {
  const user = await requireUser()
  const [cards, recentTx, summary] = await Promise.all([
    listCards(user.id),
    listTransactions(user.id, { limit: 8 }),
    portfolioSummary(user.id),
  ])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Page header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-5">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Fintech</h1>
        </div>
        <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
          <Datepicker />
          <button className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white">
            <svg className="fill-current shrink-0 xs:hidden" width="16" height="16" viewBox="0 0 16 16">
              <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
            </svg>
            <span className="max-xs:sr-only">Add Account</span>
          </button>
        </div>
      </div>

      {/* Live KPIs */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        <Kpi label="Portfolio Value" value={formatMoney(summary.balanceCents)} hint={`${summary.accountCount} accounts`} />
        <Kpi label="Income (30d)" value={formatMoney(summary.incomeCents)} hint="Inflows" />
        <Kpi label="Expenses (30d)" value={formatMoney(Math.abs(summary.expenseCents))} hint="Outflows" />
        <Kpi label="Transactions (30d)" value={String(summary.txCount30d)} hint="Total count" />
      </div>

      <div className="grid grid-cols-12 gap-6 mb-6">
        {/* Cards list */}
        <div className="col-span-full xl:col-span-6 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Your Cards</h2>
          </header>
          <div className="p-3">
            {cards.length === 0 && (
              <div className="px-3 py-6 text-sm text-gray-500 dark:text-gray-400">No cards on file.</div>
            )}
            <ul className="my-1">
              {cards.map((c) => (
                <li key={c.id} className="flex px-2 py-3 border-b border-gray-100 dark:border-gray-700/60 last:border-0">
                  <div className="grow flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        {c.nickname || `${c.brand} card`}{' '}
                        {c.primary && <span className="ml-2 text-xs font-medium bg-green-500/20 text-green-700 rounded-full px-2 py-0.5">Primary</span>}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">**** {c.last4} · exp {String(c.expMonth).padStart(2, '0')}/{c.expYear}</div>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{c.brand}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Recent transactions */}
        <div className="col-span-full xl:col-span-6 bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <header className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Recent Transactions</h2>
          </header>
          <div className="p-3">
            {recentTx.length === 0 && (
              <div className="px-3 py-6 text-sm text-gray-500 dark:text-gray-400">No transactions yet.</div>
            )}
            <ul className="my-1">
              {recentTx.map((t) => (
                <li key={t.id} className="flex px-2 py-3 border-b border-gray-100 dark:border-gray-700/60 last:border-0">
                  <div className="grow flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{t.merchant}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{formatShortDate(t.occurredAt)} · {t.category}</div>
                    </div>
                    <div className={`text-sm font-medium ${t.amountCents < 0 ? 'text-red-500' : 'text-green-600'}`}>
                      {t.amountCents < 0 ? '-' : '+'}{formatMoney(Math.abs(t.amountCents), t.currency)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Remaining static template cards */}
      <div className="grid grid-cols-12 gap-6">
        <FintechIntro />
        <FintechCard01 />
        <FintechCard03 />
        <FintechCard04 />
        <FintechCard07 />
        <FintechCard08 />
        <FintechCard09 />
        <FintechCard10 />
        <FintechCard11 />
        <FintechCard12 />
        <FintechCard13 />
        <FintechCard14 />
      </div>
    </div>
  )
}
