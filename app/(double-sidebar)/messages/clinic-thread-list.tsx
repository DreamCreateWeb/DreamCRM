'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BulkBar } from '@/components/ui/bulk-bar'
import { ActionButton } from '@/components/ui/action-button'
import { agingBorderClass, messageRotTier } from '@/lib/ui/encodings'
import { channelMeta } from './channel-meta'
import { avatarTint, messageInitials } from './message-grouping'
import {
  bulkArchiveThreadsAction,
  bulkMarkReadThreadsAction,
  bulkSnoozeThreadsAction,
} from './clinic-actions'

/**
 * Selectable thread list (left pane). The rows are unchanged from the prior
 * server-rendered list — same avatar / unread bolding / channel pill / rot
 * left-border / active teal ring — but each carries a checkbox so staff can
 * batch-triage: archive, snooze, or mark-read several conversations at once
 * (the detail panel already does these one at a time). Selection is local;
 * the bulk actions loop server-side over the existing thread services.
 */

export interface ThreadListRow {
  id: string
  /** Pre-built `?thread=…` href (the server owns the filter querystring). */
  href: string
  patientId: string
  patientFirstName: string
  patientLastName: string
  unreadCount: number
  lastMessagePreview: string | null
  lastMessageDirection: 'inbound' | 'outbound' | null
  lastMessageChannel: 'in_app' | 'email' | 'sms' | null
  /** ISO string or null. */
  lastMessageAt: string | null
  status: 'open' | 'snoozed' | 'archived'
  assignedUserName: string | null
  starred?: boolean
  /** AI triage on the latest inbound message — urgent rows pin to the top
   *  (server sort) and carry the 🚨 pill with the reason. */
  urgency?: 'urgent' | null
  urgencyReason?: string | null
}

const SNOOZE_OPTIONS = [
  { label: '4 hours', hours: 4 },
  { label: 'Tomorrow', hours: 24 },
  { label: 'Next week', hours: 24 * 7 },
]

function fmtRelative(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const ms = Date.now() - d.getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Aging left-border for an inbound thread waiting on a reply — drifts
 *  fresh (emerald) → aging (amber) → overdue (rose). Transparent when the
 *  ball isn't ours (last message outbound, or no messages yet). */
function rotBorderClass(direction: string | null, iso: string | null): string {
  if (direction !== 'inbound' || !iso) return agingBorderClass(null)
  const waitingHours = (Date.now() - new Date(iso).getTime()) / (60 * 60 * 1000)
  return agingBorderClass(messageRotTier(waitingHours))
}

export default function ClinicThreadList({
  rows,
  activeThreadId,
}: {
  rows: ThreadListRow[]
  activeThreadId: string | null
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [showSnooze, setShowSnooze] = useState(false)

  const allSelected = rows.length > 0 && selected.size === rows.length

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clear() {
    setSelected(new Set())
    setShowSnooze(false)
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))))
  }

  function runBulk(action: (ids: string[]) => Promise<void>) {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    startTransition(async () => {
      await action(ids)
      clear()
      router.refresh()
    })
  }

  return (
    <>
      {/* Select-all header — also the home for "N selected" while triaging. */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[color:var(--color-hairline)] bg-[color:var(--color-surface-2)] sticky top-0 z-[1]">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          aria-label="Select all conversations"
          className="h-3.5 w-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500/40 cursor-pointer"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {selected.size > 0 ? `${selected.size} selected` : 'Select'}
        </span>
      </div>

      <ul className="py-1">
        {rows.map((t) => {
          const ch = channelMeta(t.lastMessageChannel)
          const active = activeThreadId === t.id
          const unread = t.unreadCount > 0
          const name = `${t.patientFirstName} ${t.patientLastName}`.trim()
          const tint = avatarTint(t.patientId || name)
          const isSel = selected.has(t.id)
          return (
            <li
              key={t.id}
              className={`border-l-4 ${rotBorderClass(t.lastMessageDirection, t.lastMessageAt)} ${
                isSel ? 'bg-teal-500/[0.07]' : ''
              }`}
            >
              <div className="flex items-stretch">
                <label
                  className="flex items-center pl-2.5 pr-0.5 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                  title={`Select ${name}`}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(t.id)}
                    aria-label={`Select conversation with ${name}`}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500/40 cursor-pointer"
                  />
                </label>
                <Link
                  href={t.href}
                  aria-current={active ? 'true' : undefined}
                  title={name}
                  className={`flex flex-1 min-w-0 items-start gap-3 px-2.5 py-2.5 mr-1 rounded-[var(--r-md)] transition-colors ${
                    active
                      ? 'bg-teal-500/5 shadow-[inset_0_0_0_1px_rgb(40_179_173/0.4)]'
                      : 'hover:bg-gray-500/[0.06]'
                  }`}
                >
                  <span className="relative shrink-0">
                    <span
                      aria-hidden="true"
                      className={`flex h-9 w-9 items-center justify-center rounded-[var(--r-pill)] text-xs font-semibold ${tint.bg} ${tint.text}`}
                    >
                      {messageInitials(t.patientFirstName, t.patientLastName)}
                    </span>
                    {unread && (
                      <span
                        className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-[color:var(--color-surface-1)]"
                        aria-hidden="true"
                      />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={`text-sm truncate ${
                          unread
                            ? 'font-bold text-gray-900 dark:text-gray-100'
                            : 'font-medium text-gray-700 dark:text-gray-200'
                        }`}
                      >
                        {t.starred && (
                          <span className="text-amber-500 mr-1" title="Starred" aria-label="Starred">★</span>
                        )}
                        {name}
                      </p>
                      <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                        {fmtRelative(t.lastMessageAt)}
                      </span>
                    </div>
                    <p
                      className={`mt-0.5 text-xs truncate ${
                        unread ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {t.lastMessageDirection === 'outbound' ? (
                        <span className="text-gray-400 dark:text-gray-500">You: </span>
                      ) : null}
                      {t.lastMessagePreview ?? <span className="italic">No messages yet</span>}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {t.urgency === 'urgent' && (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-[var(--r-xs)] bg-rose-500/15 text-rose-700 dark:text-rose-300"
                          title={t.urgencyReason ? `Reads urgent: ${t.urgencyReason}` : 'Reads urgent'}
                        >
                          🚨 Urgent
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-[var(--r-xs)] ${ch.pill}`}
                        title={ch.title}
                      >
                        <span aria-hidden="true">{ch.icon}</span>
                        {ch.label}
                      </span>
                      {unread && (
                        <span
                          className="text-xs font-bold px-1.5 py-0.5 rounded-[var(--r-xs)] bg-amber-500 text-white dark:text-gray-900 tabular-nums"
                          title={`${t.unreadCount} unread message${t.unreadCount === 1 ? '' : 's'}`}
                        >
                          {t.unreadCount}
                        </span>
                      )}
                      {t.status === 'snoozed' ? (
                        <span
                          className="text-xs text-amber-700 dark:text-amber-300"
                          title="Snoozed — will resurface later"
                        >
                          💤
                        </span>
                      ) : t.assignedUserName ? (
                        <span
                          className="text-xs text-gray-400 dark:text-gray-500 truncate"
                          title={`Assigned to ${t.assignedUserName}`}
                        >
                          · {t.assignedUserName.split(' ')[0]}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </div>
            </li>
          )
        })}
      </ul>

      <BulkBar
        count={selected.size}
        noun={selected.size === 1 ? 'conversation' : 'conversations'}
        onClear={clear}
      >
        <ActionButton
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => runBulk((ids) => bulkMarkReadThreadsAction(ids))}
        >
          Mark read
        </ActionButton>
        <div className="relative">
          <ActionButton
            size="sm"
            variant="secondary"
            disabled={pending}
            aria-expanded={showSnooze}
            onClick={() => setShowSnooze((s) => !s)}
          >
            💤 Snooze
          </ActionButton>
          {showSnooze && (
            <div className="pop-in origin-bottom-right absolute right-0 bottom-full mb-1 z-10 py-1 min-w-[10rem] rounded-[var(--r-lg)] bg-[color:var(--color-surface-1)] shadow-[var(--shadow-pop)]">
              {SNOOZE_OPTIONS.map((opt) => (
                <button
                  key={opt.hours}
                  type="button"
                  onClick={() => runBulk((ids) => bulkSnoozeThreadsAction(ids, opt.hours))}
                  className="block w-full text-left text-xs px-3 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-500/[0.08]"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <ActionButton
          size="sm"
          variant="primary"
          disabled={pending}
          onClick={() => runBulk((ids) => bulkArchiveThreadsAction(ids))}
        >
          Archive
        </ActionButton>
      </BulkBar>
    </>
  )
}
