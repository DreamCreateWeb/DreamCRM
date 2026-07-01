'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useOptimistic, useState, useTransition } from 'react'
import type { LeadRow, LeadStatus, LeadCounts } from '@/lib/services/leads'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { FilterChip } from '@/components/ui/filter-chip'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { FlashToast } from '@/components/ui/flash-toast'
import { BulkBar } from '@/components/ui/bulk-bar'
import { agingBorderClass, leadAgingTier, type Tone } from '@/lib/ui/encodings'
import LeadDrawer from './lead-drawer'
import { bulkSetLeadStatusAction } from './actions'

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
  const [toast, setToast] = useState<string | null>(null)
  const [_pending, startTransition] = useTransition()

  // Optimistic status flips: the row updates the instant you act in the drawer,
  // then the action + revalidation reconcile (or revert, with a toast). In a
  // single-status view a flipped row drops out; in "All" its pill changes.
  const [optimisticRows, addOptimisticStatus] = useOptimistic(
    rows,
    (current: LeadRow[], change: { id: string; status: LeadStatus }) =>
      current.map((r) => (r.id === change.id ? { ...r, status: change.status } : r)),
  )
  const visibleRows = status === 'all' ? optimisticRows : optimisticRows.filter((r) => r.status === status)

  // ── Bulk triage selection ───────────────────────────────────────────
  const [bulkPending, startBulk] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const visibleIds = visibleRows.map((r) => r.id)
  // Only count/act on selections that are actually in view (a status filter
  // change leaves stale ids in the set — never act on a row you can't see).
  const selectedVisible = visibleIds.filter((id) => selected.has(id))
  const allSelected = visibleRows.length > 0 && selectedVisible.length === visibleRows.length

  function toggleRow(id: string) {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((cur) => {
      const next = new Set(cur)
      if (allSelected) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })
  }

  function runBulk(action: 'contacted' | 'archived') {
    const ids = selectedVisible
    if (ids.length === 0) return
    const nextStatus: LeadStatus = action === 'contacted' ? 'contacted' : 'archived'
    startBulk(async () => {
      for (const id of ids) addOptimisticStatus({ id, status: nextStatus })
      const r = await bulkSetLeadStatusAction(ids, action)
      setToast(
        action === 'contacted'
          ? `Marked ${r.updated} ${r.updated === 1 ? 'inquiry' : 'inquiries'} contacted`
          : `Archived ${r.updated} ${r.updated === 1 ? 'inquiry' : 'inquiries'}`,
      )
      setSelected(new Set())
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nav-badges:refresh'))
    })
  }

  function runLeadStatus(id: string, next: LeadStatus, action: () => Promise<unknown>) {
    setOpenId(null)
    startTransition(async () => {
      addOptimisticStatus({ id, status: next })
      try {
        await action()
      } catch (e) {
        setToast(e instanceof Error ? e.message : "Couldn't update that lead — please try again.")
      }
    })
  }

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

  // Export the current view — same status + search the table is showing.
  const exportHref = useMemo(() => {
    const p = new URLSearchParams()
    if (status && status !== 'new') p.set('status', status)
    if (search) p.set('q', search)
    const qs = p.toString()
    return qs ? `/leads/export?${qs}` : '/leads/export'
  }, [status, search])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* ── Header — this page IS the queue, so no fabricated primary; the
          legend is the key affordance instead. ──────────────────────── */}
      <PageHeader
        eyebrow={`Daily · ${orgName}`}
        title="Website inquiries"
        subtitle="People who reached out through the contact form on your website. Follow up, then turn them into patients."
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
        actions={
          <div className="flex items-center gap-2">
            <ActionButton variant="secondary" href="/settings/automations/emails?email=contact_ack">
              Edit auto-reply email
            </ActionButton>
            {counts.total > 0 && (
              <ActionButton variant="ghost" href={exportHref} target="_blank">
                Export CSV
              </ActionButton>
            )}
          </div>
        }
      />

      {/* ── Filter chips with counts ────────────────────────────────── */}
      <div className="v2-card p-4 mb-4 space-y-3">
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
      {visibleRows.length === 0 ? (
        <LeadsEmpty status={status} />
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2 px-1">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="form-checkbox"
              aria-label="Select all inquiries"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {allSelected ? 'Deselect all' : `Select all ${visibleRows.length}`}
            </span>
          </div>
          <ul className="space-y-2">
            {visibleRows.map((r) => (
              <LeadRowCard
                key={r.id}
                row={r}
                selected={selected.has(r.id)}
                onToggle={() => toggleRow(r.id)}
                onOpen={() => setOpenId(r.id)}
              />
            ))}
          </ul>
        </>
      )}

      {/* ── Sticky bulk triage bar ───────────────────────────────────── */}
      <BulkBar count={selectedVisible.length} onClear={() => setSelected(new Set())}>
        <ActionButton variant="primary" size="sm" onClick={() => runBulk('contacted')} disabled={bulkPending}>
          Mark contacted
        </ActionButton>
        <ActionButton variant="secondary" size="sm" onClick={() => runBulk('archived')} disabled={bulkPending}>
          Archive
        </ActionButton>
      </BulkBar>

      {openRow && (
        <LeadDrawer
          row={openRow}
          onClose={() => setOpenId(null)}
          onStatusChange={runLeadStatus}
        />
      )}
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

function LeadRowCard({
  row,
  selected,
  onToggle,
  onOpen,
}: {
  row: LeadRow
  selected: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const tier = row.status === 'new' ? leadAgingTier(row.ageHours) : null
  return (
    <li
      onClick={onOpen}
      className={`v2-card-interactive px-4 py-3 cursor-pointer border-l-4 ${agingBorderClass(tier)} ${
        selected ? 'bg-teal-500/5 ring-1 ring-inset ring-teal-500/40' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => { e.stopPropagation(); onToggle() }}
          onClick={(e) => e.stopPropagation()}
          className="form-checkbox mt-0.5 shrink-0"
          aria-label={`Select ${row.name}`}
        />
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
