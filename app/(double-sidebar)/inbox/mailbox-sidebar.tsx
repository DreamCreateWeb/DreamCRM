'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useFlyoutContext } from '@/app/flyout-context'
import { relativeTime } from '@/lib/utils'
import type { EmailAccountSummary, EmailMessageListItem } from '@/lib/services/mailbox'
import ComposeButton from './compose-button'
import { syncMailbox } from './mailbox-actions'

interface Props {
  accounts: EmailAccountSummary[]
  activeAccountId: string | null
  messages: EmailMessageListItem[]
  activeMessageId: string | null
}

export default function MailboxSidebar({ accounts, activeAccountId, messages, activeMessageId }: Props) {
  const { flyoutOpen, setFlyoutOpen } = useFlyoutContext()
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  async function handleSync(accountId: string) {
    setSyncing(accountId)
    setSyncError(null)
    try {
      await syncMailbox(accountId)
    } catch (err) {
      setSyncError((err as Error).message)
    } finally {
      setSyncing(null)
    }
  }

  async function handleSyncAll() {
    setSyncing('__all__')
    setSyncError(null)
    try {
      await Promise.all(accounts.map((a) => syncMailbox(a.id)))
    } catch (err) {
      setSyncError((err as Error).message)
    } finally {
      setSyncing(null)
    }
  }

  return (
    <div
      id="messages-sidebar"
      className={`absolute z-20 top-0 bottom-0 w-full md:w-auto md:static md:top-auto md:bottom-auto -mr-px md:translate-x-0 transform transition-transform duration-200 ease-in-out ${
        flyoutOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="sticky top-16 bg-white dark:bg-gray-900 overflow-x-hidden overflow-y-auto no-scrollbar shrink-0 border-r border-gray-200 dark:border-gray-700/60 md:w-[22rem] xl:w-[24rem] h-[calc(100dvh-64px)]">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/60">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-base font-semibold text-gray-800 dark:text-gray-100">Inbox</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {accounts.length} connected account{accounts.length === 1 ? '' : 's'}
              </div>
            </div>
            <ComposeButton accounts={accounts} />
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <AccountChip
              label="All"
              count={messages.length}
              active={activeAccountId === null}
              href="/inbox"
            />
            {accounts.map((a) => (
              <AccountChip
                key={a.id}
                label={a.emailAddress}
                count={a.unreadCount}
                active={activeAccountId === a.id}
                href={`/inbox?account=${a.id}`}
                status={a.syncStatus}
              />
            ))}
            <Link
              href="/inbox/settings"
              className="text-xs text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 ml-auto"
            >
              + Add
            </Link>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <button
              type="button"
              onClick={() => (activeAccountId ? handleSync(activeAccountId) : handleSyncAll())}
              disabled={syncing !== null}
              className="hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-60"
            >
              {syncing
                ? 'Syncing…'
                : activeAccountId
                  ? '↻ Refresh this account'
                  : accounts.length > 1
                    ? `↻ Refresh all (${accounts.length})`
                    : '↻ Refresh'}
            </button>
            {syncError && <span className="text-red-600">{syncError}</span>}
          </div>
        </div>
        <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
          {messages.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              No messages here yet.
            </li>
          ) : (
            messages.map((m) => {
              const isActive = m.id === activeMessageId
              return (
                <li key={m.id}>
                  <Link
                    href={
                      activeAccountId
                        ? `/inbox?account=${activeAccountId}&m=${m.id}`
                        : `/inbox?m=${m.id}`
                    }
                    onClick={() => setFlyoutOpen(false)}
                    className={`block px-4 py-3 ${
                      isActive
                        ? 'bg-violet-500/10'
                        : m.isRead
                          ? 'hover:bg-gray-50 dark:hover:bg-gray-800'
                          : 'bg-violet-500/[0.04] hover:bg-violet-500/10 dark:bg-violet-500/[0.06]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className={`text-sm truncate ${m.isRead ? 'text-gray-700 dark:text-gray-300' : 'font-semibold text-gray-800 dark:text-gray-100'}`}>
                        {m.fromName ?? m.fromEmail}
                      </div>
                      <div className="text-[10px] text-gray-500 shrink-0">{relativeTime(m.receivedAt)}</div>
                    </div>
                    <div className={`text-xs truncate ${m.isRead ? 'text-gray-500 dark:text-gray-400' : 'font-medium text-gray-700 dark:text-gray-200'}`}>
                      {m.subject ?? '(no subject)'}
                    </div>
                    {m.snippet && (
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{m.snippet}</div>
                    )}
                    {accounts.length > 1 && m.accountEmail && (
                      <div className="text-[10px] text-gray-400 mt-0.5">→ {m.accountEmail}</div>
                    )}
                  </Link>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}

function AccountChip({
  label,
  count,
  active,
  href,
  status,
}: {
  label: string
  count: number
  active: boolean
  href: string
  status?: string
}) {
  return (
    <Link
      href={href}
      className={`text-[11px] font-medium px-2 py-0.5 rounded-full border inline-flex items-center gap-1 max-w-[12rem] ${
        active
          ? 'bg-violet-500 border-violet-500 text-white'
          : 'border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <span className="truncate">{label}</span>
      {count > 0 && (
        <span
          className={`text-[10px] rounded-full px-1 ${
            active ? 'bg-white/20 text-white' : 'bg-violet-500 text-white'
          }`}
        >
          {count}
        </span>
      )}
      {status === 'error' && <span className="text-red-500" title="Sync error">!</span>}
    </Link>
  )
}
