'use client'

import { useMemo, useState } from 'react'
import { cn, relativeTime } from '@/lib/utils'

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
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-700/60 flex items-center gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-100">
          Recipients
        </h3>
        <span className="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums">
          {filtered.length} of {rows.length}
        </span>
        <div className="flex items-center gap-1 ml-auto flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'text-[11px] font-medium px-2 py-1 rounded-md',
                filter === f.key
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
              )}
            >
              {f.label}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email…"
            className="text-[12px] px-2 py-1 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 w-40"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50/80 dark:bg-stone-900/80 border-b border-stone-200 dark:border-stone-700/60 text-left text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
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
                <td colSpan={5} className="px-3 py-8 text-center text-[12px] italic text-stone-400 dark:text-stone-500">
                  No recipients in this view.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const status = r.unsubAt
                  ? { label: 'Unsubscribed', tone: 'rose' }
                  : r.bouncedAt
                    ? { label: 'Bounced', tone: 'amber' }
                    : r.failedAt
                      ? { label: 'Failed', tone: 'amber' }
                      : r.clickedAt
                        ? { label: 'Clicked', tone: 'emerald' }
                        : r.openedAt
                          ? { label: 'Opened', tone: 'sky' }
                          : r.sentAt
                            ? { label: 'Sent', tone: 'stone' }
                            : { label: 'Pending', tone: 'stone' }
                return (
                  <tr
                    key={r.email}
                    className="border-b border-stone-100 dark:border-stone-700/40 last:border-b-0 hover:bg-stone-50/60 dark:hover:bg-stone-800/30"
                  >
                    <td className="px-3 py-2 text-stone-700 dark:text-stone-200 font-medium truncate max-w-[18rem]">
                      {r.email}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={status} />
                    </td>
                    <td className="px-3 py-2 text-[12px] text-stone-500 dark:text-stone-400 tabular-nums">
                      {r.sentAt ? relativeTime(r.sentAt) : '—'}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-stone-500 dark:text-stone-400 tabular-nums">
                      {r.openedAt ? relativeTime(r.openedAt) : '—'}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-stone-500 dark:text-stone-400 tabular-nums">
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

function StatusPill({ status }: { status: { label: string; tone: string } }) {
  const map: Record<string, string> = {
    stone: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
    sky: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  }
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${map[status.tone] ?? map.stone}`}>
      {status.label}
    </span>
  )
}
