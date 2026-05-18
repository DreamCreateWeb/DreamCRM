'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useFlyoutContext } from '@/app/flyout-context'
import { relativeTime } from '@/lib/utils'
import type { ClientConversation, ClientMessagingStats, ClinicContact } from '@/lib/services/messages'
import ClientMessagingStatsCard from './client-messaging-stats'
import NewConversationButton from './new-conversation-button'

interface Props {
  conversations: ClientConversation[]
  contacts: ClinicContact[]
  stats: ClientMessagingStats
  activeId: number | null
}

type FilterMode = 'all' | 'unread' | 'stale'

export default function ClientMessagingSidebar({ conversations, contacts, stats, activeId }: Props) {
  const { flyoutOpen, setFlyoutOpen } = useFlyoutContext()
  const [filter, setFilter] = useState<FilterMode>('all')
  const [search, setSearch] = useState('')

  // Map clinic users into the picker shape the existing component expects.
  const pickerUsers = useMemo(
    () =>
      contacts.map((c) => ({
        id: c.userId,
        name: c.name ? `${c.name} — ${c.clinicName}` : `${c.email} — ${c.clinicName}`,
      })),
    [contacts],
  )

  const now = Date.now()
  const STALE_MS = 3 * 24 * 60 * 60 * 1000

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return conversations.filter((c) => {
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
  }, [conversations, filter, search, now])

  // Group by clinic so platform admin sees one logical bucket per client.
  const grouped = useMemo(() => {
    const buckets = new Map<string, { clinicName: string; clinicOrgId: string | null; convos: ClientConversation[] }>()
    for (const c of filtered) {
      const key = c.clinicOrgId ?? '__unassigned__'
      const label = c.clinicName ?? 'Unassigned'
      const existing = buckets.get(key)
      if (existing) existing.convos.push(c)
      else buckets.set(key, { clinicName: label, clinicOrgId: c.clinicOrgId, convos: [c] })
    }
    // Sort buckets by most recent activity inside them
    return Array.from(buckets.values()).sort((a, b) => {
      const aMax = Math.max(0, ...a.convos.map((c) => (c.lastAt ? new Date(c.lastAt).getTime() : 0)))
      const bMax = Math.max(0, ...b.convos.map((c) => (c.lastAt ? new Date(c.lastAt).getTime() : 0)))
      return bMax - aMax
    })
  }, [filtered])

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
              <div className="text-base font-semibold text-gray-800 dark:text-gray-100">Client Messaging</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Conversations with clinic owners &amp; admins
              </div>
            </div>
            <NewConversationButton users={pickerUsers} />
          </header>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clinic, name, or message…"
            aria-label="Search conversations"
            className="form-input text-sm py-1.5 w-full mb-2"
          />
          <div className="flex gap-1.5">
            <FilterChip label={`All (${conversations.length})`} active={filter === 'all'} onClick={() => setFilter('all')} />
            <FilterChip
              label={`Unread (${stats.unreadMessages > 0 ? conversations.filter((c) => c.unreadCount > 0).length : 0})`}
              active={filter === 'unread'}
              onClick={() => setFilter('unread')}
            />
            <FilterChip
              label={`Stale (${stats.staleConversations})`}
              active={filter === 'stale'}
              onClick={() => setFilter('stale')}
            />
          </div>
        </div>
        <div className="px-2 py-2">
          {grouped.length === 0 ? (
            <div className="px-3 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">
              {conversations.length === 0
                ? 'No conversations yet. Start one with a clinic admin to begin.'
                : 'Nothing matches these filters.'}
            </div>
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

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
        active
          ? 'bg-violet-500 border-violet-500 text-white'
          : 'border-gray-200 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      {label}
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
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">
          {clinicOrgId ? (
            <Link
              href={`/ecommerce/customers/${clinicOrgId}`}
              className="hover:text-violet-600 dark:hover:text-violet-400"
            >
              {clinicName}
            </Link>
          ) : (
            clinicName
          )}
        </div>
        {bucketUnread > 0 && (
          <span className="text-[10px] font-bold bg-violet-500 text-white rounded-full px-1.5 py-0.5">
            {bucketUnread}
          </span>
        )}
      </div>
      <ul className="space-y-0.5">
        {convos.map((c) => {
          const isActive = c.id === activeId
          return (
            <li key={c.id}>
              <Link
                href={`/messages?c=${c.id}`}
                onClick={onPick}
                className={`flex flex-col gap-0.5 p-2 rounded-lg ${
                  isActive
                    ? 'bg-violet-500/10 text-violet-600 dark:text-violet-300'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    {c.counterpartName ?? c.title ?? `Conversation #${c.id}`}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.unreadCount > 0 && (
                      <span className="text-[10px] font-bold bg-violet-500 text-white rounded-full px-1.5 py-0.5">
                        {c.unreadCount}
                      </span>
                    )}
                    {c.lastAt && (
                      <span className="text-[10px] text-gray-500">{relativeTime(c.lastAt)}</span>
                    )}
                  </div>
                </div>
                {c.lastMessage && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.lastMessage}</div>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
