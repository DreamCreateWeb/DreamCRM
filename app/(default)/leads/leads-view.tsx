'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import type { LeadRow, LeadStatus, LeadCounts } from '@/lib/services/leads'
import { PageHeader } from '@/components/ui/page-header'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { FilterChip } from '@/components/ui/filter-chip'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { agingBorderClass, leadAgingTier, type Tone } from '@/lib/ui/encodings'
import LeadDrawer from './lead-drawer'

const STATUS_CHIPS: Array<{ key: LeadStatus | 'all'; label: string }> = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'converted', label: 'Converted' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
]

// Tone-contract mapping (lib/ui/encodings). Ball-in-court matters here:
// `new` is a fresh arrival (special/violet); once we've REACHED OUT the ball
// is the lead's, so `contacted` is info/sky — amber would lie (amber = needs
// OUR action). `converted` is a done-good (ok); `archived` is inert (neutral).
const STATUS_TONE: Record<LeadStatus, Tone> = {
  new: 'special',
  contacted: 'info',
  converted: 'ok',
  archived: 'neutral',
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  converted: 'Converted',
  archived: 'Archived',
}

const STATUS_PILL_MEANING: Record<LeadStatus, string> = {
  new: 'Just arrived — needs a first call',
  contacted: "We reached out — ball's in their court",
  converted: 'Became a patient',
  archived: 'Spam, wrong number, or not a fit',
}

function ageLabel(ageHours: number): string {
  if (ageHours < 1) return 'just now'
  if (ageHours < 24) return `${ageHours}h ago`
  const days = Math.floor(ageHours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

// Hover explanation on the age — reinforces the rotting border for new leads.
function ageTitle(status: LeadStatus, ageHours: number): string {
  if (status !== 'new') return `Arrived ${ageLabel(ageHours)}`
  if (ageHours < 1) return 'Arrived under an hour ago — conversion is highest right now'
  if (ageHours <= 4) return `Arrived ${ageLabel(ageHours)} — still warm`
  if (ageHours <= 24) return `Arrived ${ageLabel(ageHours)} — getting cold`
  if (ageHours <= 72) return `Arrived ${ageLabel(ageHours)} — likely shopping around`
  return `Arrived ${ageLabel(ageHours)} without contact — call before you lose them`
}

function emptyCopy(status: LeadStatus | 'all'): { icon: string; title: string; body: string } {
  switch (status) {
    case 'new':
      return {
        icon: '🌱',
        title: 'No new leads right now.',
        body: 'When someone fills out the contact form on your public site, they land here.',
      }
    case 'contacted':
      return { icon: '📞', title: 'No leads in the "contacted" queue.', body: 'Mark a new lead as contacted once you reach out.' }
    case 'converted':
      return { icon: '🎉', title: 'No conversions yet.', body: 'Convert a contacted lead into a patient to see it here.' }
    case 'archived':
      return { icon: '📦', title: 'Archive is empty.', body: 'Spam, wrong numbers, and duplicates land here when you archive them.' }
    default:
      return { icon: '📭', title: 'No leads found.', body: 'Try a different filter or share your website.' }
  }
}

export default function LeadsView({
  rows,
  counts,
  status,
  search,
  orgName = 'Your clinic',
}: {
  rows: LeadRow[]
  counts: LeadCounts
  status: LeadStatus | 'all'
  search: string
  orgName?: string
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
      {/* ── Header — this page IS the queue, so no fabricated primary; the
          legend is the key affordance instead. ──────────────────────── */}
      <PageHeader
        eyebrow={`Daily · ${orgName}`}
        title="Website inquiries"
        subtitle="Inbound contact-form submissions from your public site. Triage, follow up, and convert into patients."
        legend={
          <EncodingLegend
            aging="leads"
            pills={(['new', 'contacted', 'converted', 'archived'] as const).map((s) => ({
              tone: STATUS_TONE[s],
              label: STATUS_LABEL[s],
              meaning: STATUS_PILL_MEANING[s],
            }))}
          />
        }
      />

      {/* ── Filter chips with counts ────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {STATUS_CHIPS.map((c) => {
            const n = c.key === 'all' ? counts.total : counts[c.key]
            return (
              <FilterChip
                key={c.key}
                active={status === c.key}
                count={n}
                onClick={() => setParam('status', c.key === 'new' ? null : c.key)}
              >
                {c.label}
              </FilterChip>
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
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <LeadsEmpty status={status} />
        </div>
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
  const tier = row.status === 'new' ? leadAgingTier(row.ageHours) : null
  return (
    <li
      onClick={onOpen}
      className={`bg-white dark:bg-gray-800 shadow-sm rounded-xl px-4 py-3 cursor-pointer hover:bg-stone-50 dark:hover:bg-gray-900/30 transition border-l-4 ${agingBorderClass(tier)}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
              {row.name}
            </span>
            <StatusPill
              tone={STATUS_TONE[row.status]}
              label={STATUS_LABEL[row.status]}
              title={STATUS_PILL_MEANING[row.status]}
            />
            {row.status === 'new' && row.ageHours <= 1 && (
              <StatusPill
                tone="ok"
                label="Fresh — call within the hour"
                title="Conversion is highest in the first hour — call now"
              />
            )}
            {row.status === 'converted' && row.convertedPatientName && (
              <Link
                href={`/patients/${row.convertedToPatientId}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-emerald-700 dark:text-emerald-300 hover:underline"
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
          <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums" title={ageTitle(row.status, row.ageHours)}>
            {ageLabel(row.ageHours)}
          </p>
          {row.sourcePage && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">from {row.sourcePage}</p>
          )}
          {row.utmCampaign && (
            <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
              {row.utmCampaign}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}

function LeadsEmpty({ status }: { status: LeadStatus | 'all' }) {
  const c = emptyCopy(status)
  return <EmptyState icon={c.icon} title={c.title} body={c.body} />
}
