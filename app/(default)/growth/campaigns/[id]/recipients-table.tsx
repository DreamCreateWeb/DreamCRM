'use client'

import { useMemo, useState } from 'react'
import { relativeTime } from '@/lib/utils'
import { FilterChip } from '@/components/ui/filter-chip'
import { StatusPill } from '@/components/ui/status-pill'
import type { Tone } from '@/lib/ui/encodings'

export interface RecipientRow {
  email: string
  sentAt: string | null
  openedAt: string | null
  clickedAt: string | null
  bouncedAt: string | null
  unsubAt: string | null
  failedAt: string | null
}

type Filter = 'all' | 'opened' | 'clicked' | 'noOpen' | 'bounced' | 'unsubscribed'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'opened', label: 'Opened' },
  { key: 'clicked', label: 'Clicked' },
  { key: 'noOpen', label: 'Not opened' },
  { key: 'bounced', label: 'Bounced' },
  { key: 'unsubscribed', label: 'Unsubscribed' },
]

// Per-recipient delivery outcome → tone contract. Sent/Opened = in flight,
// ball in their court (info); Clicked = the good outcome (ok); Bounce/Fail =
// a delivery problem (urgent); Unsubscribed = inert (neutral); Pending =
// not yet sent (neutral).
function recipientStatus(r: RecipientRow): { label: string; tone: Tone; title: string } {
  if (r.unsubAt) return { label: 'Unsubscribed', tone: 'neutral', title: 'They opted out from this send' }
  if (r.bouncedAt) return { label: 'Bounced', tone: 'urgent', title: "The address bounced — it couldn't be delivered" }
  if (r.failedAt) return { label: 'Failed', tone: 'urgent', title: 'The send failed — check the address' }
  if (r.clickedAt) return { label: 'Clicked', tone: 'ok', title: 'They opened and clicked a link' }
  if (r.openedAt) return { label: 'Opened', tone: 'info', title: 'They opened the email' }
  if (r.sentAt) return { label: 'Sent', tone: 'info', title: "Delivered — waiting to see if they open" }
  return { label: 'Pending', tone: 'neutral', title: 'Not sent yet' }
}

export default function RecipientsTable({ rows }: { rows: RecipientRow[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (term && !r.email.toLowerCase().includes(term)) return false
      switch (filter) {
        case 'opened': return !!r.openedAt
        case 'clicked': return !!r.clickedAt
        case 'noOpen': return !r.openedAt && !!r.sentAt
        case 'bounced': return !!r.bouncedAt
        case 'unsubscribed': return !!r.unsubAt
        default: return true
      }
    })
  }, [rows, filter, q])

  return (
    <div className="v2-card overflow-hidden">
      <div className="px-4 py-3 border-b border-[color:var(--color-hairline)] flex items-center gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Recipients
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums font-mono-num">
          {filtered.length} of {rows.length}
        </span>
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          {FILTERS.map((f) => (
            <FilterChip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </FilterChip>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email…"
            className="form-input w-40"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="v2-well border-b border-[color:var(--color-hairline)] text-left text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-3 py-2">Recipient</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Sent</th>
              <th className="px-3 py-2">Opened</th>
              <th className="px-3 py-2">Clicked</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No recipients in this view.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const status = recipientStatus(r)
                return (
                  <tr
                    key={r.email}
                    className="border-b border-[color:var(--color-hairline)] last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                  >
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-200 font-medium truncate max-w-[18rem]">
                      {r.email}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill tone={status.tone} label={status.label} title={status.title} />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                      {r.sentAt ? relativeTime(r.sentAt) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                      {r.openedAt ? relativeTime(r.openedAt) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                      {r.clickedAt ? relativeTime(r.clickedAt) : '—'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
