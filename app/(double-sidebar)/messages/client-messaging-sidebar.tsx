'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useFlyoutContext } from '@/app/flyout-context'
import { relativeTime } from '@/lib/utils'
import type { ClientConversation, ClientMessagingStats, ClinicContact } from '@/lib/services/messages'
import { FilterChip } from '@/components/ui/filter-chip'
import { EmptyState } from '@/components/ui/empty-state'
import ClientMessagingStatsCard from './client-messaging-stats'
import NewConversationButton from './new-conversation-button'

interface Props {
  conversations: ClientConversation[]
  clientContacts: ClinicContact[]
  teamContacts: ClinicContact[]
  stats: ClientMessagingStats
  activeId: number | null
}

type FilterMode = 'all' | 'unread' | 'stale'
type Tab = 'clients' | 'team'

export default function ClientMessagingSidebar({
  conversations,
  clientContacts,
  teamContacts,
  stats,
  activeId,
}: Props) {
  const { flyoutOpen, setFlyoutOpen } = useFlyoutContext()
  const [filter, setFilter] = useState<FilterMode>('all')
  const [search, setSearch] = useState('')

  // Default to whichever tab contains the active conversation, then to
  // clients. Memoized so toggling stays user-controlled.
  const activeConvoKind = useMemo(
    () => conversations.find((c) => c.id === activeId)?.kind ?? null,
    [conversations, activeId],
  )
  const [tab, setTab] = useState<Tab>(activeConvoKind === 'team' ? 'team' : 'clients')

  // Counts per tab so the tab labels show the load at a glance.
  const tabCounts = useMemo(() => {
    let clients = 0
    let team = 0
    let clientUnread = 0
    let teamUnread = 0
    for (const c of conversations) {
      if (c.kind === 'team') {
        team++
        teamUnread += c.unreadCount
      } else {
        // 'client' and 'other' both live under the Clients tab — 'other'
        // covers edge cases (deleted users, etc.)
        clients++
        clientUnread += c.unreadCount
      }
    }
    return { clients, team, clientUnread, teamUnread }
  }, [conversations])

  // Count of *conversations* (not messages) with unread in the current tab —
  // the number the Unread filter chip shows.
  const unreadInTab = useMemo(
    () =>
      conversations.filter(
        (c) => c.unreadCount > 0 && (tab === 'team' ? c.kind === 'team' : c.kind !== 'team'),
      ).length,
    [conversations, tab],
  )

  // Pick the right contact set + label formatter for the current tab.
  const pickerUsers = useMemo(() => {
    const source = tab === 'team' ? teamContacts : clientContacts
    return source.map((c) => ({
      id: c.userId,
      name: c.name
        ? tab === 'team'
          ? c.name
          : `${c.name} — ${c.clinicName}`
        : tab === 'team'
          ? c.email
          : `${c.email} — ${c.clinicName}`,
    }))
  }, [tab, teamContacts, clientContacts])

  const now = Date.now()
  const STALE_MS = 3 * 24 * 60 * 60 * 1000

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return conversations.filter((c) => {
      // Tab filter first
      if (tab === 'team' && c.kind !== 'team') return false
      if (tab === 'clients' && c.kind === 'team') return false
      if (filter === 'unread' && c.unreadCount === 0) return false
      if (filter === 'stale') {
        const lastMs = c.lastAt ? new Date(c.lastAt).getTime() : 0
        if (!(c.unreadCount > 0 && lastMs > 0 && now - lastMs > STALE_MS)) return false
      }
      if (term) {
        const hay = [c.clinicName, c.counterpartName, c.title, c.lastMessage]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [conversations, tab, filter, search, now])

  // Group by clinic for the Clients tab; for Team it's one flat bucket
  // since every convo lives in the same Dream Create org.
  const grouped = useMemo(() => {
    if (tab === 'team') {
      return filtered.length > 0 ? [{ clinicName: 'Team', clinicOrgId: null, convos: filtered }] : []
    }
    const buckets = new Map<string, { clinicName: string; clinicOrgId: string | null; convos: ClientConversation[] }>()
    for (const c of filtered) {
      const key = c.clinicOrgId ?? '__unassigned__'
      const label = c.clinicName ?? 'Unassigned'
      const existing = buckets.get(key)
      if (existing) existing.convos.push(c)
      else buckets.set(key, { clinicName: label, clinicOrgId: c.clinicOrgId, convos: [c] })
    }
    return Array.from(buckets.values()).sort((a, b) => {
      const aMax = Math.max(0, ...a.convos.map((c) => (c.lastAt ? new Date(c.lastAt).getTime() : 0)))
      const bMax = Math.max(0, ...b.convos.map((c) => (c.lastAt ? new Date(c.lastAt).getTime() : 0)))
      return bMax - aMax
    })
  }, [filtered, tab])

  return (
    <div
      id="messages-sidebar"
      className={`absolute z-20 top-0 bottom-0 w-full md:w-auto md:static md:top-auto md:bottom-auto -mr-px md:translate-x-0 transform transition-transform duration-200 ease-in-out ${
        flyoutOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="sticky top-16 bg-white dark:bg-gray-900 overflow-x-hidden overflow-y-auto no-scrollbar shrink-0 border-r border-gray-200 dark:border-gray-700/60 md:w-[20rem] xl:w-[22rem] h-[calc(100dvh-64px)]">
        <ClientMessagingStatsCard stats={stats} />
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/60">
          <header className="flex items-center justify-between mb-3">
            <div>
              <div className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {tab === 'team' ? 'Team Messaging' : 'Client Messaging'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {tab === 'team'
                  ? 'Conversations with your Dream Create teammates'
                  : 'Conversations with clinic owners & admins'}
              </div>
            </div>
            <NewConversationButton users={pickerUsers} />
          </header>
          {/* Tab strip — Clients / Team */}
          <div className="grid grid-cols-2 gap-1 p-0.5 bg-gray-100 dark:bg-gray-700/60 rounded-lg mb-3">
            <TabButton
              label="Clients"
              count={tabCounts.clients}
              unread={tabCounts.clientUnread}
              active={tab === 'clients'}
              onClick={() => setTab('clients')}
            />
            <TabButton
              label="Team"
              count={tabCounts.team}
              unread={tabCounts.teamUnread}
              active={tab === 'team'}
              onClick={() => setTab('team')}
            />
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'team' ? 'Search teammate or message…' : 'Search clinic, name, or message…'}
            aria-label="Search conversations"
            className="form-input text-sm py-1.5 w-full mb-2"
          />
          <div className="flex gap-1.5">
            <FilterChip
              active={filter === 'all'}
              count={tab === 'team' ? tabCounts.team : tabCounts.clients}
              onClick={() => setFilter('all')}
              title="Every conversation in this tab"
            >
              All
            </FilterChip>
            <FilterChip
              active={filter === 'unread'}
              count={unreadInTab}
              onClick={() => setFilter('unread')}
              title="Only conversations with messages you haven't read"
            >
              Unread
            </FilterChip>
            <FilterChip
              active={filter === 'stale'}
              count={stats.staleConversations}
              onClick={() => setFilter('stale')}
              title="Waiting on a reply for 3+ days"
            >
              Stale
            </FilterChip>
          </div>
        </div>
        <div className="px-2 py-2">
          {grouped.length === 0 ? (
            conversations.length === 0 ? (
              tab === 'team' ? (
                <EmptyState
                  icon="👋"
                  title="No team conversations yet"
                  body="Invite a teammate from /settings/team, then start a thread."
                />
              ) : (
                <EmptyState
                  icon="💬"
                  title="No client conversations yet"
                  body="Start one with a clinic admin to begin."
                />
              )
            ) : (
              <EmptyState
                icon="🔍"
                title="Nothing matches these filters"
                body="Try a different tab, clear the search, or switch back to All."
              />
            )
          ) : (
            grouped.map((g) => (
              <ClinicBucket
                key={g.clinicOrgId ?? '__unassigned__'}
                clinicName={g.clinicName}
                clinicOrgId={g.clinicOrgId}
                convos={g.convos}
                activeId={activeId}
                onPick={() => setFlyoutOpen(false)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({
  label,
  count,
  unread,
  active,
  onClick,
}: {
  label: string
  count: number
  unread: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-sm font-medium py-1.5 rounded-md transition-colors ${
        active
          ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 shadow-sm'
          : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100'
      }`}
    >
      {label} <span className="text-gray-500 dark:text-gray-400 font-normal tabular-nums">({count})</span>
      {unread > 0 && (
        <span
          className="ml-1 inline-flex items-center justify-center text-xs font-bold bg-violet-600 text-white rounded-full px-1.5 align-middle tabular-nums"
          title={`${unread} unread`}
        >
          {unread}
        </span>
      )}
    </button>
  )
}

function ClinicBucket({
  clinicName,
  clinicOrgId,
  convos,
  activeId,
  onPick,
}: {
  clinicName: string
  clinicOrgId: string | null
  convos: ClientConversation[]
  activeId: number | null
  onPick: () => void
}) {
  const bucketUnread = convos.reduce((acc, c) => acc + c.unreadCount, 0)
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between px-2 py-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">
          {clinicOrgId ? (
            <Link
              href={`/ecommerce/customers/${clinicOrgId}`}
              className="hover:text-violet-700 dark:hover:text-violet-300"
            >
              {clinicName}
            </Link>
          ) : (
            clinicName
          )}
        </div>
        {bucketUnread > 0 && (
          <span
            className="text-xs font-bold bg-violet-600 text-white rounded-full px-1.5 py-0.5 tabular-nums"
            title={`${bucketUnread} unread in this clinic`}
          >
            {bucketUnread}
          </span>
        )}
      </div>
      <ul className="space-y-0.5">
        {convos.map((c) => {
          const isActive = c.id === activeId
          const title = c.counterpartName ?? c.title ?? `Conversation #${c.id}`
          return (
            <li key={c.id}>
              <Link
                href={`/messages?c=${c.id}`}
                onClick={onPick}
                aria-current={isActive ? 'true' : undefined}
                className={`flex flex-col gap-0.5 p-2 rounded-lg ${
                  isActive
                    ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate" title={title}>
                    {title}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.unreadCount > 0 && (
                      <span
                        className="text-xs font-bold bg-violet-600 text-white rounded-full px-1.5 py-0.5 tabular-nums"
                        title={`${c.unreadCount} unread`}
                      >
                        {c.unreadCount}
                      </span>
                    )}
                    {c.lastAt && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{relativeTime(c.lastAt)}</span>
                    )}
                  </div>
                </div>
                {c.lastMessage && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate" title={c.lastMessage}>{c.lastMessage}</div>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
