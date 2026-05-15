export const metadata = {
  title: 'Credit Cards - DreamCRM',
  description: 'Manage your cards',
}

export const dynamic = 'force-dynamic'

import { requireUser } from '@/lib/session'
import { listCards } from '@/lib/services/fintech'
import AddCardModal from './add-card-modal'

export default async function CreditCards() {
  const user = await requireUser()
  const cards = await listCards(user.id)

  return (
    <div className="lg:relative lg:flex bg-white dark:bg-gray-900">
      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
        {/* Page header */}
        <div className="sm:flex sm:justify-between sm:items-center mb-5">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Cards</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {cards.length} card{cards.length === 1 ? '' : 's'} on file
            </p>
          </div>
          <AddCardModal />
        </div>

        {/* Filters */}
        <div className="mb-5">
          <ul className="flex flex-wrap -m-1">
            <li className="m-1">
              <button className="inline-flex items-center justify-center text-sm font-medium leading-5 rounded-full px-3 py-1 border border-transparent shadow-sm bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-800 transition">
                View All
              </button>
            </li>
            <li className="m-1">
              <button className="inline-flex items-center justify-center text-sm font-medium leading-5 rounded-full px-3 py-1 border border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 transition">
                Primary
              </button>
            </li>
            <li className="m-1">
              <button className="inline-flex items-center justify-center text-sm font-medium leading-5 rounded-full px-3 py-1 border border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 transition">
                Other
              </button>
            </li>
          </ul>
        </div>

        {/* Credit cards */}
        <div className="space-y-2">
          {cards.length === 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400 px-4 py-10 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700/60 text-center">
              You haven&apos;t added any cards yet. Click <em>Add Card</em> to add one.
            </div>
          )}
          {cards.map((card, idx) => (
            <label key={card.id} className="relative block cursor-pointer text-left w-full">
              <input type="radio" name="card-radio" className="peer sr-only" defaultChecked={idx === 0} />
              <div className="p-4 rounded-lg dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm transition">
                <div className="grid grid-cols-12 items-center gap-x-2">
                  <div className="col-span-6 order-1 sm:order-none sm:col-span-3 flex items-center space-x-4">
                    <div className="w-8 h-6 rounded-sm bg-linear-to-tr from-gray-700 to-gray-500 shrink-0" aria-hidden="true" />
                    <div>
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{card.nickname || card.brand}</div>
                      <div className="text-xs">**{card.last4}</div>
                    </div>
                  </div>
                  <div className="col-span-6 order-2 sm:order-none sm:col-span-3 text-left sm:text-center">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{card.brand}</div>
                  </div>
                  <div className="col-span-6 order-1 sm:order-none sm:col-span-4 text-right sm:text-center">
                    <div className="text-sm">
                      exp {String(card.expMonth).padStart(2, '0')}/{card.expYear}
                    </div>
                  </div>
                  <div className="col-span-6 order-2 sm:order-none sm:col-span-2 text-right">
                    <div className={`text-xs inline-flex font-medium rounded-full text-center px-2.5 py-1 ${card.primary ? 'bg-green-500/20 text-green-700' : 'bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400'}`}>
                      {card.primary ? 'Primary' : 'Active'}
                    </div>
                  </div>
                </div>
              </div>
              <div
                className="absolute inset-0 border-2 border-transparent peer-checked:border-violet-400 dark:peer-checked:border-violet-500 rounded-lg pointer-events-none"
                aria-hidden="true"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
