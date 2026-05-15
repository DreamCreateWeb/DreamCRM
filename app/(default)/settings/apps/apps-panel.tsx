'use client'

import { useState, useTransition } from 'react'
import { toggleApp } from '../actions'

interface AppDef {
  key: string
  name: string
  description: string
  category: 'utility' | 'marketing' | 'development'
  rating: number
  users: string
  accent: string
}

export const AVAILABLE_APPS: AppDef[] = [
  { key: 'slack', name: 'Slack', description: 'Get pings in channels when records change.', category: 'utility', rating: 4.8, users: '12K+', accent: 'violet' },
  { key: 'hubspot', name: 'HubSpot', description: 'Sync contacts & deals with HubSpot CRM.', category: 'marketing', rating: 4.5, users: '8K+', accent: 'orange' },
  { key: 'mailchimp', name: 'Mailchimp', description: 'Push contacts into Mailchimp lists automatically.', category: 'marketing', rating: 4.4, users: '5K+', accent: 'yellow' },
  { key: 'github', name: 'GitHub', description: 'Link engineering activity to CRM accounts.', category: 'development', rating: 4.9, users: '7K+', accent: 'gray' },
  { key: 'stripe', name: 'Stripe', description: 'Pull payments and subscription state into DreamCRM.', category: 'utility', rating: 4.9, users: '15K+', accent: 'sky' },
  { key: 'zapier', name: 'Zapier', description: 'Trigger 5000+ apps when CRM events fire.', category: 'development', rating: 4.6, users: '20K+', accent: 'red' },
]

const CATEGORIES = ['all', 'utility', 'marketing', 'development'] as const

export default function AppsPanel({ connected }: { connected: Record<string, boolean> }) {
  const [filter, setFilter] = useState<(typeof CATEGORIES)[number]>('all')
  const [state, setState] = useState(connected)
  const [pending, startTransition] = useTransition()
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  function handleToggle(app: AppDef) {
    const next = !state[app.key]
    setPendingKey(app.key)
    startTransition(async () => {
      try {
        await toggleApp({ appKey: app.key, enabled: next })
        setState((s) => ({ ...s, [app.key]: next }))
      } finally {
        setPendingKey(null)
      }
    })
  }

  const items = AVAILABLE_APPS.filter((a) => filter === 'all' || a.category === filter)

  return (
    <div className="grow">
      <div className="p-6">
        <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-5">Connected Apps</h2>

        <div className="mb-6">
          <div className="mb-4 border-b border-gray-200 dark:border-gray-700/60">
            <ul className="text-sm font-medium flex flex-nowrap -mx-4 sm:-mx-6 lg:-mx-8 overflow-x-scroll no-scrollbar">
              {CATEGORIES.map((c) => (
                <li key={c} className="pb-3 mr-6 last:mr-0 first:pl-4 sm:first:pl-6 lg:first:pl-8 last:pr-4 sm:last:pr-6 lg:last:pr-8">
                  <button
                    type="button"
                    onClick={() => setFilter(c)}
                    className={`whitespace-nowrap capitalize ${filter === c ? 'text-violet-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                  >
                    {c === 'all' ? 'View All' : c}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <section className="pb-6 border-b border-gray-200 dark:border-gray-700/60">
          <div className="grid grid-cols-12 gap-6">
            {items.map((app) => {
              const isConnected = !!state[app.key]
              const isBusy = pendingKey === app.key
              return (
                <div key={app.key} className="col-span-full xl:col-span-6 2xl:col-span-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 shadow-sm rounded-lg">
                  <div className="flex flex-col h-full p-5">
                    <div className="grow">
                      <header className="flex items-center mb-4">
                        <div className={`w-10 h-10 rounded-full shrink-0 bg-${app.accent}-500 mr-3 flex items-center justify-center text-white text-base font-semibold`}>
                          {app.name[0]}
                        </div>
                        <h3 className="text-lg text-gray-800 dark:text-gray-100 font-semibold">{app.name}</h3>
                      </header>
                      <div className="text-sm">{app.description}</div>
                    </div>
                    <footer className="mt-4">
                      <div className="flex flex-wrap justify-between items-center">
                        <div className="flex space-x-3">
                          <div className="flex items-center text-gray-400 dark:text-gray-500 text-sm">
                            {app.users}
                          </div>
                          <div className="flex items-center text-yellow-500 text-sm">
                            <svg className="shrink-0 fill-current mr-1.5" width="16" height="16" viewBox="0 0 16 16">
                              <path d="M10 5.934L8 0 6 5.934H0l4.89 3.954L2.968 16 8 12.223 13.032 16 11.11 9.888 16 5.934z" />
                            </svg>
                            {app.rating}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleToggle(app)}
                          className={`btn-sm shadow-sm flex items-center ${
                            isConnected
                              ? 'border-gray-200 dark:border-gray-700/60 text-gray-800 dark:text-gray-300'
                              : 'bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800'
                          } disabled:opacity-60`}
                        >
                          {isBusy ? '…' : isConnected ? (
                            <>
                              <svg className="w-3 h-3 shrink-0 fill-current text-green-500 mr-2" viewBox="0 0 12 12">
                                <path d="M10.28 1.28L3.989 7.575 1.695 5.28A1 1 0 00.28 6.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 1.28z" />
                              </svg>
                              Connected
                            </>
                          ) : (
                            'Connect'
                          )}
                        </button>
                      </div>
                    </footer>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
