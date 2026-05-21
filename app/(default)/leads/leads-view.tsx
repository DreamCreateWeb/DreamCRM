'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import type { LeadRow, LeadStatus, LeadCounts } from '@/lib/services/leads'
import LeadDrawer from './lead-drawer'

const STATUS_CHIPS: Array<{ key: LeadStatus | 'all'; label: string }> = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'converted', label: 'Converted' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
]

const STATUS_PILL: Record<LeadStatus, string> = {
  new: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  contacted: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  converted: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  archived: 'bg-stone-500/15 text-stone-600 dark:text-stone-300',
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  converted: 'Converted',
  archived: 'Archived',
}

// Aging tint on the left border — new leads rot quickly. Industry rule
// of thumb: respond within an hour or conversion rate drops sharply.
function agingClass(status: LeadStatus, ageHours: number): string {
  if (status !== 'new') return 'border-l-transparent'
  if (ageHours <= 1) return 'border-l-emerald-400'
  if (ageHours <= 4) return 'border-l-stone-300 dark:border-l-stone-600'
  if (ageHours <= 24) return 'border-l-amber-400'
  if (ageHours <= 72) return 'border-l-amber-600'
  return 'border-l-red-600'
}

function ageLabel(ageHours: number): string {
  if (ageHours < 1) return 'just now'
  if (ageHours < 24) return `${ageHours}h ago`
  const days = Math.floor(ageHours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function emptyCopy(status: LeadStatus | 'all'): { emoji: string; title: string; subtitle: string } {
  switch (status) {
    case 'new':
      return {
        emoji: '🌱',
        title: 'No new leads right now.',
        subtitle: 'When someone fills out the contact form on your public site, they land here.',
      }
    case 'contacted':
      return { emoji: '📞', title: 'No leads in the "contacted" queue.', subtitle: 'Mark a new lead as contacted once you reach out.' }
    case 'converted':
      return { emoji: '🎉', title: 'No conversions yet.', subtitle: 'Convert a contacted lead into a patient to see it here.' }
    case 'archived':
      return { emoji: '📦', title: 'Archive is empty.', subtitle: 'Spam, wrong numbers, and duplicates land here when you archive them.' }
    default:
      return { emoji: '📭', title: 'No leads found.', subtitle: 'Try a different filter or share your website.' }
  }
}

export default function LeadsView({
  rows,
  counts,
  status,
  search,
}: {
  rows: LeadRow[]
  counts: LeadCounts
  status: LeadStatus | 'all'
  search: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState(search)
  const [_pending, startTransition] = useTransition()

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString())
    if (value === null || value === '') next.delete(key); else next.set(key, value)
    startTransition(() => router.push(`/leads?${next.toString()}`))
  }

  function submitSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setParam('q', searchInput.trim() || null)
  }

  const openRow = useMemo(() => rows.find((r) => r.id === openId) ?? null, [rows, openId])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">
          Leads
        </p>
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          Website inquiries
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Inbound contact-form submissions from your public site. Triage, follow up, and convert into patients.
        </p>
      </div>

      {/* ── Filter chips with counts ────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {STATUS_CHIPS.map((c) => {
            const n = c.key === 'all' ? counts.total : counts[c.key]
            const active = status === c.key
            return (
              <button
                key={c.key}
                onClick={() => setParam('status', c.key === 'new' ? null : c.key)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition flex items-center gap-1.5 ${
                  active
                    ? 'bg-gray-900 dark:bg-gray-100 text-gray-100 dark:text-gray-800'
                    : 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {c.label}
                <span className={`text-[10px] font-semibold px-1.5 rounded-full ${active ? 'bg-white/20 dark:bg-black/10' : 'bg-white dark:bg-gray-800'}`}>
                  {n}
                </span>
              </button>
            )
          })}
          <form onSubmit={submitSearch} className="flex-1 min-w-[200px] ml-auto">
            <input
              type="text"
              placeholder="Search name, email, phone, message"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="form-input w-full text-sm"
            />
          </form>
        </div>
      </div>

      {/* ── List ─────────────────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <EmptyState status={status} />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <LeadRowCard key={r.id} row={r} onOpen={() => setOpenId(r.id)} />
          ))}
        </ul>
      )}

      {openRow && (
        <LeadDrawer
          row={openRow}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

function LeadRowCard({ row, onOpen }: { row: LeadRow; onOpen: () => void }) {
  return (
    <li
      onClick={onOpen}
      className={`bg-white dark:bg-gray-800 shadow-sm rounded-xl px-4 py-3 cursor-pointer hover:bg-stone-50 dark:hover:bg-gray-900/30 transition border-l-4 ${agingClass(row.status, row.ageHours)}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
              {row.name}
            </span>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_PILL[row.status]}`}>
              {STATUS_LABEL[row.status]}
            </span>
            {row.status === 'new' && row.ageHours <= 1 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                Fresh — call within the hour
              </span>
            )}
            {row.status === 'converted' && row.convertedPatientName && (
              <Link
                href={`/patients/${row.convertedToPatientId}`}
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] text-emerald-700 dark:text-emerald-300 hover:underline"
              >
                → {row.convertedPatientName}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-600 dark:text-gray-300 flex-wrap">
            <span>{row.phone}</span>
            {row.email && <span>· {row.email}</span>}
            {row.preferredDate && <span>· prefers {row.preferredDate}</span>}
          </div>
          {row.message && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2 italic">
              &ldquo;{row.message}&rdquo;
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-gray-500 dark:text-gray-400">{ageLabel(row.ageHours)}</p>
          {row.sourcePage && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">from {row.sourcePage}</p>
          )}
          {row.utmCampaign && (
            <p className="text-[10px] text-violet-500 dark:text-violet-400 mt-0.5">
              {row.utmCampaign}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}

function EmptyState({ status }: { status: LeadStatus | 'all' }) {
  const c = emptyCopy(status)
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-6 py-16 text-center">
      <p className="text-4xl mb-3">{c.emoji}</p>
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">{c.title}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">{c.subtitle}</p>
    </div>
  )
}
