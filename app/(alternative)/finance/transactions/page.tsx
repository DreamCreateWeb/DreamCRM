export const metadata = {
  title: 'Transactions - DreamCRM',
  description: 'Your transactions',
}

export const dynamic = 'force-dynamic'

import { SelectedItemsProvider } from '@/app/selected-items-context'
import { FlyoutProvider } from '@/app/flyout-context'
import { TransactionDetailProvider } from './transaction-context'
import DeleteButton from '@/components/delete-button'
import SearchForm from '@/components/search-form'
import TransactionDropdown from './transaction-dropdown'
import TransactionsTable, { type Transaction } from './transactions-table'
import PaginationClassic from '@/components/pagination-classic'
import TransactionPanel from './transaction-panel'
import NewTransactionModal from './new-transaction-modal'
import { requireUser } from '@/lib/session'
import { accountBalance, listTransactions } from '@/lib/services/fintech'
import { formatMoney, formatShortDate } from '@/lib/utils'

export default async function Transactions() {
  const user = await requireUser()
  const [txs, balance] = await Promise.all([
    listTransactions(user.id, { limit: 200 }),
    accountBalance(user.id),
  ])

  const transactions: Transaction[] = txs.map((t) => ({
    id: t.id,
    image: null,
    name: t.merchant,
    date: formatShortDate(t.occurredAt),
    status: t.status.charAt(0).toUpperCase() + t.status.slice(1),
    amount: (t.amountCents < 0 ? '-' : '+') + formatMoney(Math.abs(t.amountCents), t.currency),
  }))

  return (
    <SelectedItemsProvider>
      <FlyoutProvider>
        <TransactionDetailProvider>
          <div className="relative bg-white dark:bg-gray-900 h-full">
            <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
              {/* Page header */}
              <div className="sm:flex sm:justify-between sm:items-center mb-4 md:mb-2">
                <div className="mb-4 sm:mb-0">
                  <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">{formatMoney(balance)}</h1>
                </div>
                <div className="grid grid-flow-col sm:auto-cols-max justify-start sm:justify-end gap-2">
                  <DeleteButton />
                  <div className="hidden sm:block">
                    <SearchForm />
                  </div>
                  <NewTransactionModal />
                  <button className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white">Export</button>
                </div>
              </div>

              <div className="mb-5">
                <span>Transactions from </span>
                <TransactionDropdown />
              </div>

              <div className="mb-5">
                <ul className="flex flex-wrap -m-1">
                  <li className="m-1">
                    <button className="inline-flex items-center justify-center text-sm font-medium leading-5 rounded-full px-3 py-1 border border-transparent shadow-sm bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-800 transition">
                      View All
                    </button>
                  </li>
                  <li className="m-1">
                    <button className="inline-flex items-center justify-center text-sm font-medium leading-5 rounded-full px-3 py-1 border border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 transition">
                      Completed
                    </button>
                  </li>
                  <li className="m-1">
                    <button className="inline-flex items-center justify-center text-sm font-medium leading-5 rounded-full px-3 py-1 border border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 transition">
                      Pending
                    </button>
                  </li>
                </ul>
              </div>

              <TransactionsTable transactions={transactions} />

              <div className="mt-8">
                <PaginationClassic />
              </div>
            </div>

            <TransactionPanel />
          </div>
        </TransactionDetailProvider>
      </FlyoutProvider>
    </SelectedItemsProvider>
  )
}
