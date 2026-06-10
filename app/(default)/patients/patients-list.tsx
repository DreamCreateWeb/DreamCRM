'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import type {
  PatientListRow,
  PatientListFilters,
  PatientListSort,
  PatientFilterMeta,
} from '@/lib/services/patients'
import { patientFlagGlyphs, type PillLegendRow } from '@/lib/ui/encodings'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FilterChip } from '@/components/ui/filter-chip'
import { GlyphCluster } from '@/components/ui/glyph-cluster'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { BulkBar } from '@/components/ui/bulk-bar'
import { FlashToast } from '@/components/ui/flash-toast'
import BulkMessageModal from './bulk-message-modal'
import AddPatientModal from './add-patient-modal'

function money(cents: number): string {
  if (cents === 0) return '—'
  const dollars = cents / 100
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${dollars.toFixed(0)}`
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtRelative(d: Date | null): string {
  if (!d) return ''
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'today'
  if (days < 0) {
    const absDays = Math.abs(days)
    if (absDays === 1) return 'tomorrow'
    if (absDays < 7) return `in ${absDays}d`
    if (absDays < 30) return `in ${Math.floor(absDays / 7)}w`
    return `in ${Math.floor(absDays / 30)}mo`
  }
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

/** Days since a date, for the hoverable "last visit" explainer. */
function daysSince(d: Date | null): number | null {
  if (!d) return null
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
}

/** Last-visit aging text color — kept as a freshness cue (not a status pill). */
function lastVisitTone(d: Date | null): string {
  if (!d) return 'text-gray-500 dark:text-gray-400'
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (days < 90) return 'text-emerald-700 dark:text-emerald-300'
  if (days < 180) return 'text-amber-700 dark:text-amber-300'
  return 'text-rose-700 dark:text-rose-300'
}

/** Recall status → semantic tone + label, per the design-system contract. */
const RECALL: Record<
  PatientListRow['recallStatus'],
  { tone: 'ok' | 'warn' | 'urgent' | 'neutral'; label: string; title: string }
> = {
  scheduled: { tone: 'ok', label: 'Scheduled', title: 'Next visit booked' },
  due: { tone: 'warn', label: 'Due', title: 'Due for recall — send a nudge' },
  overdue: { tone: 'urgent', label: 'Overdue', title: 'Past due — needs outreach' },
  na: { tone: 'neutral', label: '—', title: 'No recall due' },
}

/** Legend rows for the recall pills the table renders. */
const RECALL_LEGEND: PillLegendRow[] = [
  { tone: 'ok', label: 'Scheduled', meaning: 'Next visit booked' },
  { tone: 'warn', label: 'Due', meaning: 'Due for recall — send a nudge' },
  { tone: 'urgent', label: 'Overdue', meaning: 'Past due — needs outreach' },
  { tone: 'neutral', label: '—', meaning: 'No recall due' },
]

const SOURCE_LABEL: Record<string, string> = {
  website: 'Website',
  booking: 'Booking widget',
  referral: 'Referral',
  walk_in: 'Walk-in',
  manual: 'Manual',
  lead_form: 'Contact form',
  invite: 'Invite',
}

export default function PatientsList({
  rows,
  meta,
  filters,
  sort,
  orgName,
}: {
  rows: PatientListRow[]
  meta: PatientFilterMeta
  filters: PatientListFilters
  sort: PatientListSort
  orgName: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  // ?new=1 (the global palette's "Add a patient" quick action) opens the
  // add modal on arrival.
  const [addOpen, setAddOpen] = useState(() => params.get('new') === '1')
  const [searchInput, setSearchInput] = useState(filters.search ?? '')
  const [toast, setToast] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  }
  function toggleOne(id: string) {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString())
    if (value === null || value === '') next.delete(key); else next.set(key, value)
    startTransition(() => router.push(`/patients?${next.toString()}`))
  }

  function setFlag(key: 'balance' | 'intake' | 'birthday', on: boolean) {
    setParam(key, on ? '1' : null)
  }

  function submitSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setParam('q', searchInput.trim() || null)
  }

  function cycleSortFor(field: PatientListSort['field']) {
    const current = sort.field === field ? sort.direction : null
    const nextDir = current === 'asc' ? 'desc' : 'asc'
    setParam('sort', `${field}:${nextDir}`)
  }

  const sortArrow = (field: PatientListSort['field']) => {
    if (sort.field !== field) return ''
    return sort.direction === 'asc' ? ' ▲' : ' ▼'
  }

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected],
  )
  const reachableCount = useMemo(
    () => selectedRows.filter((r) => r.email).length,
    [selectedRows],
  )

  const noFiltersActive =
    (!filters.status || filters.status === 'all') &&
    !filters.hasBalance &&
    !filters.missingIntake &&
    !filters.birthdayThisMonth &&
    !filters.sources?.length &&
    !filters.search

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow={`Daily · ${orgName}`}
        title={`${rows.length} ${rows.length === 1 ? 'patient' : 'patients'}`}
        subtitle="The people your clinic has a relationship with — who's due, who needs a nudge, and who to greet by name."
        legend={
          <EncodingLegend
            glyphs={[
              'newPatient',
              'birthday',
              'balance',
              'missingIntakeNext',
              'unconfirmed48h',
              'lapsed',
              'optedOut',
            ]}
            pills={RECALL_LEGEND}
          />
        }
        actions={
          <ActionButton variant="primary" onClick={() => setAddOpen(true)}>
            + Add patient
          </ActionButton>
        }
      />

      {/* ── Filter chips + search ────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        <form onSubmit={submitSearch} className="flex-1 min-w-[260px]">
          <input
            type="text"
            placeholder="Search by name, email, or phone"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="form-input w-full text-sm"
          />
        </form>
        <div className="flex flex-wrap gap-2 items-center">
          <FilterChip
            active={!filters.status || filters.status === 'all'}
            onClick={() => setParam('status', null)}
          >
            All
          </FilterChip>
          <FilterChip
            active={filters.status === 'new'}
            onClick={() => setParam('status', filters.status === 'new' ? null : 'new')}
            title="Joined in the last 30 days"
          >
            New (≤30d)
          </FilterChip>
          <FilterChip
            active={filters.status === 'recall_due'}
            onClick={() => setParam('status', filters.status === 'recall_due' ? null : 'recall_due')}
            title="Due or overdue for a recall visit"
          >
            Recall due
          </FilterChip>
          <FilterChip
            active={filters.status === 'inactive'}
            onClick={() => setParam('status', filters.status === 'inactive' ? null : 'inactive')}
            title="No visit in 9+ months and nothing booked"
          >
            Lapsed
          </FilterChip>
          <FilterChip
            active={!!filters.hasBalance}
            onClick={() => setFlag('balance', !filters.hasBalance)}
            title="Has an outstanding balance"
          >
            $ Has balance
          </FilterChip>
          <FilterChip
            active={!!filters.missingIntake}
            onClick={() => setFlag('intake', !filters.missingIntake)}
            title="No intake form on file before their next visit"
          >
            📝 Missing intake
          </FilterChip>
          <FilterChip
            active={!!filters.birthdayThisMonth}
            onClick={() => setFlag('birthday', !filters.birthdayThisMonth)}
            title="Birthday falls in the current month"
          >
            🎂 Birthday this month
          </FilterChip>
          {meta.sources.length > 0 && (
            <select
              value={(filters.sources?.[0]) ?? ''}
              onChange={(e) => setParam('source', e.target.value || null)}
              className="form-select text-xs py-1"
              aria-label="Filter by source"
            >
              <option value="">Any source</option>
              {meta.sources.map((s) => (
                <option key={s} value={s}>{SOURCE_LABEL[s] ?? s}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          noFiltersActive ? (
            <EmptyState
              icon="🌿"
              title="No patients yet"
              body="Your first patient will appear here when someone books on your site. Until then, you can add one manually."
              action={
                <ActionButton variant="primary" size="sm" onClick={() => setAddOpen(true)}>
                  + Add patient
                </ActionButton>
              }
            />
          ) : (
            <EmptyState
              icon="🔍"
              title="No patients match these filters"
              body="Try clearing a filter or searching a different name."
              action={
                <ActionButton variant="secondary" size="sm" href="/patients">
                  Clear filters
                </ActionButton>
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="form-checkbox"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-4 py-3 text-left cursor-pointer" onClick={() => cycleSortFor('name')}>
                    Patient{sortArrow('name')}
                  </th>
                  <th className="px-4 py-3 text-left cursor-pointer" onClick={() => cycleSortFor('lastVisit')}>
                    Last visit{sortArrow('lastVisit')}
                  </th>
                  <th className="px-4 py-3 text-left cursor-pointer" onClick={() => cycleSortFor('nextVisit')}>
                    Next visit{sortArrow('nextVisit')}
                  </th>
                  <th className="px-4 py-3 text-left">Recall</th>
                  <th className="px-4 py-3 text-right cursor-pointer" onClick={() => cycleSortFor('balance')}>
                    Balance{sortArrow('balance')}
                  </th>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-left cursor-pointer" onClick={() => cycleSortFor('lastActivity')}>
                    Last contact{sortArrow('lastActivity')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {rows.map((r) => (
                  <PatientRow
                    key={r.id}
                    row={r}
                    selected={selected.has(r.id)}
                    onToggle={() => toggleOne(r.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Bulk action bar ──────────────────────────────────────────── */}
      <BulkBar
        count={selected.size}
        noun={selected.size === 1 ? 'patient selected' : 'patients selected'}
        onClear={() => setSelected(new Set())}
      >
        <ActionButton
          variant="primary"
          size="sm"
          onClick={() => setBulkOpen(true)}
          disabled={reachableCount === 0}
          title={reachableCount === 0 ? 'None of the selected patients have an email on file' : undefined}
        >
          Email {reachableCount} {reachableCount === 1 ? 'patient' : 'patients'}
        </ActionButton>
      </BulkBar>

      {/* Loading overlay */}
      {isPending && (
        <div className="fixed inset-0 bg-black/5 dark:bg-white/5 pointer-events-none z-20" />
      )}

      {bulkOpen && (
        <BulkMessageModal
          patients={selectedRows}
          onClose={() => setBulkOpen(false)}
          onSent={(count) => {
            setBulkOpen(false)
            setSelected(new Set())
            setToast(count === 1 ? 'Email sent to 1 patient' : `Email sent to ${count} patients`)
          }}
        />
      )}
      {addOpen && <AddPatientModal onClose={() => setAddOpen(false)} />}
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

function PatientRow({
  row,
  selected,
  onToggle,
}: {
  row: PatientListRow
  selected: boolean
  onToggle: () => void
}) {
  const recall = RECALL[row.recallStatus]
  const balanceClass = row.outstandingBalanceCents > 0
    ? 'text-rose-700 dark:text-rose-300 font-semibold'
    : 'text-gray-500 dark:text-gray-400'
  const lastVisitDays = daysSince(row.lastVisitAt)
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="form-checkbox"
          aria-label={`Select ${row.fullName}`}
        />
      </td>
      <td className="px-4 py-3">
        <Link href={`/patients/${row.id}`} className="block group">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100 group-hover:underline">
              {row.fullName}
            </span>
            {row.ageYears !== null && (
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                {row.ageYears}
              </span>
            )}
            <GlyphCluster glyphs={patientFlagGlyphs(row.flags)} cap={4} />
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[260px]">
            {row.email ?? row.phone ?? ''}
          </div>
        </Link>
      </td>
      <td
        className={`px-4 py-3 tabular-nums ${lastVisitTone(row.lastVisitAt)}`}
        title={lastVisitDays !== null ? `Last visit ${lastVisitDays} ${lastVisitDays === 1 ? 'day' : 'days'} ago` : 'No visit on file yet'}
        suppressHydrationWarning
      >
        <div>{fmtDate(row.lastVisitAt)}</div>
        {row.lastVisitAt && (
          <div className="text-xs opacity-75">{fmtRelative(row.lastVisitAt)}</div>
        )}
      </td>
      <td className="px-4 py-3">
        {row.nextVisitAt ? (
          <>
            <div className="text-gray-800 dark:text-gray-100 tabular-nums">{fmtDate(row.nextVisitAt)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
              {(row.nextVisitType ?? '').replace(/_/g, ' ')}
            </div>
          </>
        ) : (
          <span className="text-gray-500 dark:text-gray-400 italic text-xs">None scheduled</span>
        )}
      </td>
      <td className="px-4 py-3">
        <StatusPill tone={recall.tone} label={recall.label} title={recall.title} />
      </td>
      <td className={`px-4 py-3 text-right tabular-nums ${balanceClass}`}>
        {money(row.outstandingBalanceCents)}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
        {row.source ? SOURCE_LABEL[row.source] ?? row.source : '—'}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 tabular-nums" suppressHydrationWarning>
        {row.lastContactAt ? fmtRelative(row.lastContactAt) : '—'}
      </td>
    </tr>
  )
}
