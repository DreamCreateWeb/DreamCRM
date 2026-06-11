'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useFlyoutContext } from '@/app/flyout-context'
import { cn, relativeTime } from '@/lib/utils'
import type { EmailAccountSummary, EmailThreadListItem } from '@/lib/services/mailbox'
import type { InboxTerminology } from '@/lib/inbox-terminology'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import ComposeButton from '../compose-button'
import { bulkThreadAction, syncMailbox } from '../mailbox-actions'
import FilterChips from './filter-chips'
import CategoryTabs from './category-tabs'
import BulkActionBar from './bulk-action-bar'
import { useSelection } from './selection-context'
import { INTENT_COLORS } from './intent-badge'

function RowAvatar({
  name,
  intent,
}: {
  name: string
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
    'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
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
        <span className={cn('absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white dark:ring-gray-900', ringColor)} />
      )}
    </div>
  )
}

interface Props {
  accounts: EmailAccountSummary[]
  activeAccountId: string | null
  threads: EmailThreadListItem[]
  activeThreadId: string | null
  intentCounts: Record<string, number>
  categoryCounts: Record<string, number>
  activeCategory: string
  activeIntent: string | null
  unreadOnly: boolean
  starredOnly: boolean
  patientsOnly: boolean
  unreadCount: number
  terminology: InboxTerminology
}

const JUNK_CATEGORIES = new Set(['updates', 'promotions', 'spam'])

export default function MailboxSidebar({
  accounts,
  activeAccountId,
  threads,
  activeThreadId,
  intentCounts,
  categoryCounts,
  activeCategory,
  activeIntent,
  unreadOnly,
  starredOnly,
  patientsOnly,
  unreadCount,
  terminology,
}: Props) {
  const { flyoutOpen, setFlyoutOpen } = useFlyoutContext()
  const pathname = usePathname()
  const sp = useSearchParams()
  const router = useRouter()
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [archivingAll, startArchiveAll] = useTransition()
  const selection = useSelection()

  const visibleThreadIds = useMemo(() => threads.map((t) => t.threadId), [threads])
  const groups = useMemo(() => groupThreadsByDate(threads), [threads])

  useEffect(() => {
    selection.clear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, activeAccountId, activeIntent, unreadOnly, starredOnly, patientsOnly])

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

  function handleArchiveAll() {
    if (visibleThreadIds.length === 0) return
    startArchiveAll(async () => {
      try {
        await bulkThreadAction({ ids: visibleThreadIds, action: 'archive' })
        selection.clear()
        router.refresh()
      } catch (err) {
        console.warn('[inbox] archive-all failed', err)
      }
    })
  }

  function threadHref(latestMessageId: string): string {
    const params = new URLSearchParams(sp.toString())
    params.set('m', latestMessageId)
    return `${pathname}?${params.toString()}`
  }

  function accountHref(accountId: string | null): string {
    const params = new URLSearchParams(sp.toString())
    if (accountId) params.set('account', accountId); else params.delete('account')
    params.delete('m')
    return `${pathname}?${params.toString()}`
  }

  function handleRowCheckbox(e: React.MouseEvent, threadId: string) {
    const rangeFrom = e.shiftKey ? selection.lastToggledRef.current : null
    selection.toggle(threadId, rangeFrom ? { rangeFrom, allIds: visibleThreadIds } : undefined)
  }

  const showArchiveAll = JUNK_CATEGORIES.has(activeCategory) && threads.length > 0

  return (
    <div
      id="messages-sidebar"
      className={cn(
        'absolute z-20 top-0 bottom-0 w-full md:w-auto md:static md:top-auto md:bottom-auto -mr-px md:translate-x-0 transform transition-transform duration-200 ease-in-out',
        flyoutOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="sticky top-16 bg-white dark:bg-gray-900 overflow-x-hidden overflow-y-auto no-scrollbar shrink-0 border-r border-gray-200 dark:border-gray-700/60 md:w-[22rem] xl:w-[24rem] h-[calc(100dvh-64px)]">
        {selection.count > 0 ? (
          <BulkActionBar visibleIds={visibleThreadIds} activeThreadId={activeThreadId} />
        ) : (
          <SidebarHeader
            accounts={accounts}
            activeAccountId={activeAccountId}
            threadCount={threads.length}
            syncing={syncing}
            syncError={syncError}
            onSync={() => handleSync(activeAccountId ? 'one' : 'all')}
            accountHref={accountHref}
          />
        )}

        <CategoryTabs counts={categoryCounts} activeCategory={activeCategory} />

        <FilterChips
          intentCounts={intentCounts}
          activeIntent={activeIntent}
          unreadOnly={unreadOnly}
          starredOnly={starredOnly}
          patientsOnly={patientsOnly}
          showIntents={activeCategory === 'primary' && terminology.isClinical}
          terminology={terminology}
          totalCount={threads.length}
          unreadCount={unreadCount}
        />

        {showArchiveAll && (
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700/40 bg-gray-50/60 dark:bg-gray-800/30">
            {/* Bulk archive of a junk tab — routine triage, so secondary not danger. */}
            <ActionButton
              size="sm"
              variant="secondary"
              onClick={handleArchiveAll}
              disabled={archivingAll}
              className="w-full justify-center"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <rect x="3" y="4" width="18" height="4" rx="1" />
                <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" strokeLinecap="round" />
              </svg>
              {archivingAll ? 'Archiving…' : `Archive all ${threads.length}`}
            </ActionButton>
          </div>
        )}

        {threads.length === 0 ? (
          <EmptyState
            icon="📭"
            title={unreadOnly ? 'No unread email' : starredOnly ? 'Nothing starred' : "You're all caught up"}
            body={
              unreadOnly || starredOnly
                ? 'Try clearing the filters to see the rest of your inbox.'
                : 'New email lands here the moment it arrives.'
            }
          />
        ) : (
          <ul>
            {groups.map((group) => (
              <li key={group.label}>
                <div className="sticky top-0 z-10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-100/80 dark:border-gray-700/30">
                  {group.label}
                </div>
                <ul>
                  {group.items.map((t) => {
                    const isActive = t.threadId === activeThreadId
                    const isChecked = selection.isSelected(t.threadId)
                    const patientName = t.patientFirstName
                      ? `${t.patientFirstName} ${t.patientLastName ?? ''}`.trim()
                      : null
                    return (
                      <li key={t.threadId} className="relative group">
                        {isActive && (
                          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-teal-500 z-10" />
                        )}
                        {!t.isRead && !isActive && (
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald-500 z-10" />
                        )}
                        <div
                          className={cn(
                            'flex items-start gap-2 pl-4 pr-3.5 py-2.5 transition-colors border-b border-[color:var(--color-hairline)]',
                            isActive
                              ? 'bg-teal-500/5'
                              : isChecked
                                ? 'bg-gray-500/[0.08]'
                                : 'hover:bg-gray-500/[0.06]',
                          )}
                        >
                          <div
                            className={cn(
                              'shrink-0 self-center transition-opacity',
                              selection.count > 0 || isChecked
                                ? 'opacity-100'
                                : 'opacity-0 group-hover:opacity-100',
                            )}
                          >
                            <Checkbox
                              checked={isChecked}
                              onClick={(e) => handleRowCheckbox(e, t.threadId)}
                            />
                          </div>

                          <Link
                            href={threadHref(t.latestMessageId)}
                            onClick={() => setFlyoutOpen(false)}
                            className="flex items-start gap-2.5 min-w-0 grow"
                          >
                            <RowAvatar name={t.fromName ?? t.fromEmail} intent={t.intent} />
                            <div className="min-w-0 grow">
                              <div className="flex items-baseline gap-1.5 mb-0.5">
                                <span
                                  className={cn(
                                    'text-[13px] truncate leading-tight',
                                    t.isRead
                                      ? 'text-gray-600 dark:text-gray-400'
                                      : 'font-semibold text-gray-900 dark:text-gray-100',
                                  )}
                                >
                                  {t.fromName ?? t.fromEmail}
                                </span>
                                {t.totalCount > 1 && (
                                  <span
                                    className={cn(
                                      'text-xs tabular-nums rounded-full px-1.5 py-0.5 leading-none shrink-0',
                                      t.unreadCount > 0
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 font-medium'
                                        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
                                    )}
                                    title={`${t.totalCount} messages${t.unreadCount > 0 ? `, ${t.unreadCount} unread` : ''}`}
                                  >
                                    {t.totalCount}
                                  </span>
                                )}
                                {t.isStarred && (
                                  <svg className="w-3 h-3 text-amber-500 shrink-0 self-center" viewBox="0 0 24 24" fill="currentColor" aria-label="Starred" role="img">
                                    <path d="M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z" />
                                  </svg>
                                )}
                                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 shrink-0 tabular-nums whitespace-nowrap">
                                  {relativeTime(t.receivedAt)}
                                </span>
                              </div>
                              <div
                                className={cn(
                                  'text-xs truncate leading-snug',
                                  t.isRead
                                    ? 'text-gray-500 dark:text-gray-400'
                                    : 'text-gray-800 dark:text-gray-200',
                                )}
                              >
                                <span className={cn(t.isRead ? '' : 'font-medium')}>
                                  {t.subject ?? '(no subject)'}
                                </span>
                                {t.snippet && (
                                  <span className="text-gray-500 dark:text-gray-400 font-normal">
                                    {' — '}
                                    {t.snippet}
                                  </span>
                                )}
                              </div>
                              {(patientName || (accounts.length > 1 && t.accountEmail)) && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  {patientName && (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium rounded-full bg-emerald-100/70 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 px-1.5 py-0.5" title={`Linked to ${patientName}`}>
                                      <span className="w-1 h-1 rounded-full bg-emerald-500" aria-hidden="true" />
                                      {patientName}
                                    </span>
                                  )}
                                  {accounts.length > 1 && t.accountEmail && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate" title={t.accountEmail}>
                                      {t.accountEmail}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </Link>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function SidebarHeader({
  accounts,
  activeAccountId,
  threadCount,
  syncing,
  syncError,
  onSync,
  accountHref,
}: {
  accounts: EmailAccountSummary[]
  activeAccountId: string | null
  threadCount: number
  syncing: string | null
  syncError: string | null
  onSync: () => void
  accountHref: (accountId: string | null) => string
}) {
  return (
    <div className="px-4 pt-3 pb-2 border-b border-gray-100 dark:border-gray-700/40">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 tracking-tight">Inbox</h2>
        <button
          type="button"
          onClick={onSync}
          disabled={syncing !== null}
          aria-label="Refresh inbox"
          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-60"
          title="Check for new mail"
        >
          {syncing ? 'syncing…' : 'refresh'}
        </button>
        <div className="ml-auto">
          {/* The sidebar's single primary action. */}
          <ComposeButton accounts={accounts} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1 items-center">
        <AccountChip
          label="All"
          count={threadCount}
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
          className="text-xs font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 ml-auto"
          title="Connect another mailbox"
        >
          + Add
        </Link>
      </div>
      {syncError && <div className="mt-1 text-xs text-rose-600 dark:text-rose-400">{syncError}</div>}
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
      aria-current={active ? 'true' : undefined}
      className={cn(
        'text-xs font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 max-w-[12rem] transition-colors',
        active
          ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-[color:var(--color-hairline-strong)]'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
      )}
    >
      <span className="truncate">{label}</span>
      {count > 0 && (
        <span className={cn('text-xs rounded-full px-1 tabular-nums', active ? 'opacity-80' : 'text-gray-500 dark:text-gray-400')}>
          {count}
        </span>
      )}
      {status === 'error' && (
        <span className="text-rose-600 dark:text-rose-400 font-bold" title="Sync error — try refreshing" aria-label="Sync error">!</span>
      )}
    </Link>
  )
}

function Checkbox({ checked, onClick }: { checked: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick(e)
      }}
      className={cn(
        'w-4 h-4 rounded border flex items-center justify-center transition-colors',
        checked
          ? 'bg-gray-900 border-gray-900 dark:bg-gray-100 dark:border-gray-100'
          : 'border-gray-300 dark:border-gray-600 hover:border-gray-500 dark:hover:border-gray-400 bg-white dark:bg-gray-900',
      )}
    >
      {checked && (
        <svg className="w-3 h-3 text-white dark:text-gray-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

interface ThreadGroup {
  label: string
  items: EmailThreadListItem[]
}

function groupThreadsByDate(threads: EmailThreadListItem[]): ThreadGroup[] {
  if (threads.length === 0) return []
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000
  const dow = now.getDay()
  const startOfWeek = startOfToday - dow * 24 * 60 * 60 * 1000
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  function bucketFor(ts: number): string {
    if (ts >= startOfToday) return 'Today'
    if (ts >= startOfYesterday) return 'Yesterday'
    if (ts >= startOfWeek) return 'This Week'
    if (ts >= startOfMonth) return 'This Month'
    return 'Older'
  }

  const groups: ThreadGroup[] = []
  let current: ThreadGroup | null = null
  for (const t of threads) {
    const ts = new Date(t.receivedAt).getTime()
    const label = bucketFor(ts)
    if (!current || current.label !== label) {
      current = { label, items: [] }
      groups.push(current)
    }
    current.items.push(t)
  }
  return groups
}
