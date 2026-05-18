'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useFlyoutContext } from '@/app/flyout-context'
import { cn, relativeTime } from '@/lib/utils'
import type { EmailAccountSummary, EmailMessageListItem } from '@/lib/services/mailbox'
import ComposeButton from '../compose-button'
import { syncMailbox } from '../mailbox-actions'
import FilterChips from './filter-chips'
import CategoryTabs from './category-tabs'
import { INTENT_COLORS } from './intent-badge'

/**
 * Avatar with optional intent-color outline ring + unread dot in the corner.
 * Replaces the old "colored stripe on the very left of the row" indicator
 * since the stripe got crowded against the row's left padding. Keeps
 * unread information visible without taking a separate column.
 */
function RowAvatar({
  name,
  unread,
  intent,
}: {
  name: string
  unread: boolean
  intent: string | null
}) {
  const initial = (name?.[0] ?? '?').toUpperCase()
  const hue = Math.abs(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 6
  const colors = [
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200',
  ]
  const ringColor = intent ? (INTENT_COLORS[intent] ?? INTENT_COLORS.other).dot : 'bg-transparent'
  return (
    <div className="relative shrink-0 mt-0.5">
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center font-semibold text-[12px]',
          colors[hue],
        )}
      >
        {initial}
      </div>
      {intent && (
        <span className={cn('absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white dark:ring-stone-900', ringColor)} />
      )}
      {unread && !intent && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-stone-900" />
      )}
    </div>
  )
}

interface Props {
  accounts: EmailAccountSummary[]
  activeAccountId: string | null
  messages: EmailMessageListItem[]
  activeMessageId: string | null
  intentCounts: Record<string, number>
  categoryCounts: Record<string, number>
  activeCategory: string
  activeIntent: string | null
  unreadOnly: boolean
  starredOnly: boolean
  patientsOnly: boolean
  unreadCount: number
}

export default function MailboxSidebar({
  accounts,
  activeAccountId,
  messages,
  activeMessageId,
  intentCounts,
  categoryCounts,
  activeCategory,
  activeIntent,
  unreadOnly,
  starredOnly,
  patientsOnly,
  unreadCount,
}: Props) {
  const { flyoutOpen, setFlyoutOpen } = useFlyoutContext()
  const pathname = usePathname()
  const sp = useSearchParams()
  const router = useRouter()
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  async function handleSync(scope: 'one' | 'all') {
    setSyncing(scope === 'one' ? activeAccountId : '__all__')
    setSyncError(null)
    try {
      if (scope === 'one' && activeAccountId) {
        await syncMailbox(activeAccountId)
      } else {
        await Promise.all(accounts.map((a) => syncMailbox(a.id)))
      }
    } catch (err) {
      setSyncError((err as Error).message)
    } finally {
      setSyncing(null)
      router.refresh()
    }
  }

  function messageHref(messageId: string): string {
    const params = new URLSearchParams(sp.toString())
    params.set('m', messageId)
    return `${pathname}?${params.toString()}`
  }

  function accountHref(accountId: string | null): string {
    const params = new URLSearchParams(sp.toString())
    if (accountId) params.set('account', accountId); else params.delete('account')
    params.delete('m')
    return `${pathname}?${params.toString()}`
  }

  return (
    <div
      id="messages-sidebar"
      className={cn(
        'absolute z-20 top-0 bottom-0 w-full md:w-auto md:static md:top-auto md:bottom-auto -mr-px md:translate-x-0 transform transition-transform duration-200 ease-in-out',
        flyoutOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="sticky top-16 bg-white dark:bg-stone-900 overflow-x-hidden overflow-y-auto no-scrollbar shrink-0 border-r border-stone-200 dark:border-stone-700/60 md:w-[22rem] xl:w-[24rem] h-[calc(100dvh-64px)]">
        {/* Header */}
        <div className="px-4 pt-3.5 pb-2 border-b border-stone-100 dark:border-stone-700/40">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-base font-semibold text-stone-900 dark:text-stone-100 tracking-tight">Inbox</div>
              <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                {accounts.length} connected account{accounts.length === 1 ? '' : 's'}
                {' · '}
                <button
                  type="button"
                  onClick={() => handleSync(activeAccountId ? 'one' : 'all')}
                  disabled={syncing !== null}
                  className="hover:text-stone-800 dark:hover:text-stone-200 disabled:opacity-60"
                >
                  {syncing ? 'syncing…' : 'refresh'}
                </button>
              </div>
            </div>
            <ComposeButton accounts={accounts} />
          </div>
          {/* Account chips */}
          <div className="flex flex-wrap gap-1 items-center">
            <AccountChip
              label="All"
              count={messages.length}
              active={activeAccountId === null}
              href={accountHref(null)}
            />
            {accounts.map((a) => (
              <AccountChip
                key={a.id}
                label={a.emailAddress}
                count={a.unreadCount}
                active={activeAccountId === a.id}
                href={accountHref(a.id)}
                status={a.syncStatus}
              />
            ))}
            <Link
              href="/inbox/settings"
              className="text-[11px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 ml-auto"
            >
              + Add
            </Link>
          </div>
          {syncError && <div className="mt-1 text-[11px] text-rose-600">{syncError}</div>}
        </div>

        <CategoryTabs counts={categoryCounts} activeCategory={activeCategory} />

        <FilterChips
          intentCounts={intentCounts}
          activeIntent={activeIntent}
          unreadOnly={unreadOnly}
          starredOnly={starredOnly}
          patientsOnly={patientsOnly}
          showIntents={activeCategory === 'primary'}
          totalCount={messages.length}
          unreadCount={unreadCount}
        />

        {/* Message list */}
        <ul>
          {messages.length === 0 ? (
            <li className="px-4 py-12 text-center text-sm text-stone-500 dark:text-stone-400">
              No messages here yet.
            </li>
          ) : (
            messages.map((m) => {
              const isActive = m.id === activeMessageId
              const patientName = m.patientFirstName
                ? `${m.patientFirstName} ${m.patientLastName ?? ''}`.trim()
                : null
              return (
                <li key={m.id} className="relative">
                  {/* Active selection: thin left bar (Linear style) */}
                  {isActive && (
                    <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-stone-900 dark:bg-stone-100" />
                  )}
                  <Link
                    href={messageHref(m.id)}
                    onClick={() => setFlyoutOpen(false)}
                    className={cn(
                      'flex items-start gap-2.5 px-3.5 py-2.5 transition-colors border-b border-stone-100 dark:border-stone-700/30 last:border-b-0',
                      isActive
                        ? 'bg-stone-100/80 dark:bg-stone-800/60'
                        : m.isRead
                          ? 'hover:bg-stone-50 dark:hover:bg-stone-800/30'
                          : 'hover:bg-stone-50 dark:hover:bg-stone-800/30',
                    )}
                  >
                    <RowAvatar name={m.fromName ?? m.fromEmail} unread={!m.isRead} intent={m.intent} />
                    <div className="min-w-0 grow">
                      {/* Top row: sender · star · time */}
                      <div className="flex items-baseline gap-1.5 mb-0.5">
                        <span
                          className={cn(
                            'text-[13px] truncate leading-tight',
                            m.isRead
                              ? 'text-stone-700 dark:text-stone-300'
                              : 'font-semibold text-stone-900 dark:text-stone-100',
                          )}
                        >
                          {m.fromName ?? m.fromEmail}
                        </span>
                        {m.isStarred && (
                          <svg className="w-3 h-3 text-amber-500 shrink-0 self-center" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z" />
                          </svg>
                        )}
                        <span className="ml-auto text-[10px] text-stone-400 dark:text-stone-500 shrink-0 tabular-nums whitespace-nowrap">
                          {relativeTime(m.receivedAt)}
                        </span>
                      </div>
                      {/* Subject + inline snippet (Gmail-style "subject — preview") */}
                      <div
                        className={cn(
                          'text-[12px] truncate leading-snug',
                          m.isRead
                            ? 'text-stone-600 dark:text-stone-400'
                            : 'text-stone-800 dark:text-stone-200',
                        )}
                      >
                        <span className={cn(m.isRead ? '' : 'font-medium')}>
                          {m.subject ?? '(no subject)'}
                        </span>
                        {m.snippet && (
                          <span className="text-stone-400 dark:text-stone-500 font-normal">
                            {' — '}
                            {m.snippet}
                          </span>
                        )}
                      </div>
                      {/* Bottom row: badges */}
                      {(patientName || (accounts.length > 1 && m.accountEmail)) && (
                        <div className="flex items-center gap-1.5 mt-1">
                          {patientName && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full bg-emerald-100/70 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 px-1.5 py-0.5">
                              <span className="w-1 h-1 rounded-full bg-emerald-500" />
                              {patientName}
                            </span>
                          )}
                          {accounts.length > 1 && m.accountEmail && (
                            <span className="text-[10px] text-stone-400 dark:text-stone-500 truncate">
                              {m.accountEmail}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
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
      className={cn(
        'text-[11px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 max-w-[12rem] transition-colors',
        active
          ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
          : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800',
      )}
    >
      <span className="truncate">{label}</span>
      {count > 0 && (
        <span className={cn('text-[10px] rounded-full px-1 tabular-nums', active ? 'opacity-80' : 'text-stone-500 dark:text-stone-400')}>
          {count}
        </span>
      )}
      {status === 'error' && <span className="text-rose-500" title="Sync error">!</span>}
    </Link>
  )
}
